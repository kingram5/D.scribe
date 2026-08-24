import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import {
  BRAINSTORM_MESSAGES_MAX_BYTES,
  messagesPayloadBytes,
  sanitizeBrainstormMessages,
  userTurnCount,
  type BrainstormSessionRecord,
} from "@/lib/brainstorm-session";

const CLOSE_STATUSES = new Set(["finished", "discarded"]);

async function ownedProject(projectId: string, userId: string) {
  const supabase = createServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();
  return { supabase, project };
}

async function activeSession(
  supabase: ReturnType<typeof createServerClient>,
  projectId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("brainstorm_sessions")
    .select("id, project_id, user_id, messages, status, turn_count, created_at, updated_at")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) return { session: null as BrainstormSessionRecord | null, error };
  return { session: (data as BrainstormSessionRecord | null) ?? null, error: null };
}

export async function GET(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const project_id = new URL(req.url).searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const { supabase, project } = await ownedProject(project_id, user.id);
  if (!project) {
    return NextResponse.json({ session: null });
  }

  const { session, error } = await activeSession(supabase, project_id, user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session });
}

export async function PUT(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_id, messages: rawMessages, turn_count: rawTurnCount } = (body ?? {}) as {
    project_id?: unknown;
    messages?: unknown;
    turn_count?: unknown;
  };

  if (typeof project_id !== "string" || !project_id) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const messages = sanitizeBrainstormMessages(rawMessages);
  if (!messages) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  if (messagesPayloadBytes(messages) > BRAINSTORM_MESSAGES_MAX_BYTES) {
    return NextResponse.json({ error: "Conversation is too large to save." }, { status: 413 });
  }

  const turn_count = typeof rawTurnCount === "number" && Number.isFinite(rawTurnCount)
    ? Math.max(0, Math.floor(rawTurnCount))
    : userTurnCount(messages);

  const { supabase, project } = await ownedProject(project_id, user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { session, error: readError } = await activeSession(supabase, project_id, user.id);
  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  if (session) {
    const { data, error } = await supabase
      .from("brainstorm_sessions")
      .update({ messages, turn_count, updated_at: now })
      .eq("id", session.id)
      .eq("user_id", user.id)
      .select("id, project_id, user_id, messages, status, turn_count, created_at, updated_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ session: data });
  }

  const { data, error } = await supabase
    .from("brainstorm_sessions")
    .insert({
      project_id,
      user_id: user.id,
      messages,
      turn_count,
      status: "active",
      updated_at: now,
    })
    .select("id, project_id, user_id, messages, status, turn_count, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_id, status } = (body ?? {}) as {
    project_id?: unknown;
    status?: unknown;
  };

  if (typeof project_id !== "string" || !project_id) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  if (typeof status !== "string" || !CLOSE_STATUSES.has(status)) {
    return NextResponse.json({ error: "status must be finished or discarded" }, { status: 400 });
  }

  const { supabase, project } = await ownedProject(project_id, user.id);
  if (!project) {
    // Closing a project the caller does not own is a no-op, not a leak.
    return NextResponse.json({ ok: true, closed: false });
  }

  const { session, error: readError } = await activeSession(supabase, project_id, user.id);
  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ ok: true, closed: false });
  }

  const { error } = await supabase
    .from("brainstorm_sessions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, closed: true });
}
