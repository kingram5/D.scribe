import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { askClaudeWithUsage, creativeFreedomToTemp } from "@/lib/claude-lite";
import { sanitizeGenerated } from "@/lib/sanitize-output";
import { selectionEditSystem, selectionEditPrompt } from "@/lib/prompts/rewrite";
import { checkInk, recordInkUsage } from "@/lib/ink";

// POST /api/rewrite/selection — rewrite a selected text range
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "rewrite");
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }

  // Pre-flight Ink check
  const inkCheck = await checkInk(user.id);
  if (!inkCheck.allowed) {
    return NextResponse.json(
      { error: "out_of_ink", message: inkCheck.reason },
      { status: 402 }
    );
  }

  const {
    chapter_id,
    selected_text,
    context_before,
    context_after,
    feedback,
    creative_freedom = 50,
  } = await req.json();

  if (!chapter_id || !selected_text?.trim() || !feedback?.trim()) {
    return NextResponse.json(
      { error: "chapter_id, selected_text, and feedback are required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Verify ownership via chapter → project → user
  const { data: chapter } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", chapter_id)
    .single();

  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, voice_profile")
    .eq("id", chapter.project_id)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const system = selectionEditSystem(project.voice_profile);
  const prompt = selectionEditPrompt({
    selectedText: selected_text,
    contextBefore: context_before || "",
    contextAfter: context_after || "",
    feedback,
  });

  const temperature = creativeFreedomToTemp(creative_freedom);

  const result = await askClaudeWithUsage(system, prompt, {
    maxTokens: 4096,
    temperature,
  });
  await recordInkUsage(user.id, chapter.project_id, "rewrite", "quality", result.usage);

  const rewritten = sanitizeGenerated(result.text);

  return NextResponse.json({ rewritten_text: rewritten });
}
