import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { checkInk, recordInkUsage } from "@/lib/ink";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { askClaudeWithUsage, cleanJsonLite } from "@/lib/claude-lite";
import { sanitizeBrainstormMessages, messagesPayloadBytes, BRAINSTORM_MESSAGES_MAX_BYTES, userTurnCount } from "@/lib/brainstorm-session";
import { capturedChips, ingredientsFor } from "@/lib/theo/ingredients";
import { authorTurns, mergeNotes, readNotes, stripPrivateTags } from "@/lib/theo/notes";
import { SCRIBE_SYSTEM, scribeUserMessage } from "@/lib/theo/scribe";

export const maxDuration = 30;

/**
 * Theo's note-taker. The studio calls this AFTER each of Theo's replies, while
 * the author is reading and typing, so it adds nothing to the wait for his next
 * question. A small model proposes an update; theo/notes.ts checks it (every
 * "verbatim" line is string-matched against what the author actually said) and
 * the result is stored on the active session for the next turn to read.
 *
 * Failure here is silent by design: a missed note must never interrupt an
 * interview. The studio just keeps the chips and lines it already has.
 */
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed } = await checkRateLimit(user.id, "brainstorm_notes", 40);
  if (!allowed) return NextResponse.json({ skipped: "rate_limited" });

  let body: { project_id?: unknown; messages?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const projectId = typeof body.project_id === "string" ? body.project_id : "";
  const raw = sanitizeBrainstormMessages(body.messages);
  if (!projectId || !raw) return NextResponse.json({ error: "project_id and messages required" }, { status: 400 });
  if (messagesPayloadBytes(raw) > BRAINSTORM_MESSAGES_MAX_BYTES) return NextResponse.json({ skipped: "too_large" });

  const messages = raw.map((m) => (m.role === "user" ? { ...m, content: stripPrivateTags(m.content) } : m));
  // Nothing worth noting until the author has actually said something.
  if (authorTurns(messages).length < 1) return NextResponse.json({ skipped: "too_early" });

  const supabase = createServerClient();
  const { data: project } = await supabase.from("projects").select("id, audience").eq("id", projectId).eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const ink = await checkInk(user.id, "brainstorm_notes");
  if (!ink.allowed) return NextResponse.json({ skipped: "out_of_ink" });

  // The active session row holds the running notes. Create it if the autosave
  // has not landed yet, so the first notes are never lost.
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("brainstorm_sessions").select("id, notes")
    .eq("project_id", projectId).eq("user_id", user.id).eq("status", "active").maybeSingle();

  const prev = readNotes((existing as { notes?: unknown } | null)?.notes);
  const ingredients = ingredientsFor(project.audience);

  let next = prev;
  try {
    const { text, usage } = await askClaudeWithUsage(SCRIBE_SYSTEM, scribeUserMessage(messages, prev, ingredients), {
      model: "fast", maxTokens: 700, temperature: 0.2,
    });
    recordInkUsage(user.id, projectId, "brainstorm_notes", "fast", usage).catch((err) =>
      logger.error("recordInkUsage failed", { route: "/api/brainstorm/notes", userId: user.id, error: err }));
    next = mergeNotes(prev, JSON.parse(cleanJsonLite(text)), messages, ingredients.map((i) => i.id));
  } catch (err) {
    logger.error("Theo note-taker failed", { route: "/api/brainstorm/notes", userId: user.id, error: err });
    return NextResponse.json({ skipped: "scribe_failed", keeperLines: prev.keeperLines, chips: capturedChips(project.audience, prev.captured) });
  }

  if (existing?.id) {
    await supabase.from("brainstorm_sessions").update({ notes: next, updated_at: now }).eq("id", existing.id).eq("user_id", user.id);
  } else {
    await supabase.from("brainstorm_sessions").insert({
      project_id: projectId, user_id: user.id, messages, turn_count: userTurnCount(messages), status: "active", notes: next, updated_at: now,
    });
  }

  // The studio gets only what the author is allowed to see: their own lines and
  // plain-language chips. Threads, directives and pacing stay private.
  return NextResponse.json({ keeperLines: next.keeperLines, chips: capturedChips(project.audience, next.captured) });
}
