import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { askClaude, cleanJson } from "@/lib/claude-lite";
import { OUTLINE_SYSTEM, expandOutlinePrompt } from "@/lib/prompts/outline";
import { requireAuth } from "@/lib/auth";

type ExpandMode = "preview" | "confirm";

export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;
  const body = await req.json();
  const { project_id, mode } = body as { project_id?: string; mode?: ExpandMode };
  if (!project_id || !mode) return NextResponse.json({ error: "project_id and mode required" }, { status: 400 });
  return NextResponse.json({ ok: true, project_id, mode });
}
