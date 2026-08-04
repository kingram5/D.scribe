import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { askClaudeWithUsage, cleanJson } from "@/lib/claude-lite";
import { logger } from "@/lib/logger";
import { OUTLINE_SYSTEM, outlinePrompt } from "@/lib/prompts/outline";
import { requireAuth } from "@/lib/auth";
import { checkInk, recordInkUsage } from "@/lib/ink";
import { reconcileOutline, type DraftChapter } from "@/lib/outline-reconcile";

// POST /api/outline — generate chapter outline from key points
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  // Pre-flight Ink check
  const inkCheck = await checkInk(user.id, "outline");
  if (!inkCheck.allowed) {
    return NextResponse.json(
      { error: "out_of_ink", message: inkCheck.reason },
      { status: 402 }
    );
  }

  const { project_id, num_chapters } = await req.json();
  if (!project_id) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Get project + key points — verify ownership
  const [projectRes, keyPointsRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", project_id).eq("user_id", user.id).single(),
    supabase.from("key_points").select("*").eq("project_id", project_id).order("created_at"),
  ]);

  if (!projectRes.data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const project = projectRes.data;
  const keyPoints = keyPointsRes.data || [];

  if (keyPoints.length === 0) {
    return NextResponse.json(
      { error: "No key points found. Run analysis first." },
      { status: 400 }
    );
  }

  const chapterCount = num_chapters || project.num_chapters || Math.max(3, Math.ceil(keyPoints.length / 3));
  const targetWordsPerChapter = project.target_words_per_chapter || 2500;

  const basePrompt = outlinePrompt(
    keyPoints.map((kp) => ({ title: kp.title, summary: kp.summary })),
    chapterCount,
    project.audience,
    project.title,
    project.voice_profile
  );

  const parseChapters = (raw: string): DraftChapter[] => {
    const parsed = JSON.parse(cleanJson(raw));
    if (!Array.isArray(parsed)) throw new Error("Outline was not a JSON array");
    return parsed as DraftChapter[];
  };

  let totalUsage = { input_tokens: 0, output_tokens: 0 };
  const addUsage = (u: { input_tokens: number; output_tokens: number }) => {
    totalUsage = {
      input_tokens: totalUsage.input_tokens + u.input_tokens,
      output_tokens: totalUsage.output_tokens + u.output_tokens,
    };
  };

  try {
    const first = await askClaudeWithUsage(OUTLINE_SYSTEM, basePrompt, { temperature: 0.5 });
    addUsage(first.usage);
    let chapters = parseChapters(first.text);

    // One corrective retry when the model ignores the requested count. Cheaper
    // and far better quality than mechanically reshaping a wrong-sized outline.
    if (chapters.length !== chapterCount) {
      logger.warn("Outline returned the wrong chapter count — retrying once", {
        route: "/api/outline",
        userId: user.id,
        meta: { project_id, requested: chapterCount, received: chapters.length },
      });
      const retry = await askClaudeWithUsage(
        OUTLINE_SYSTEM,
        `${basePrompt}\n\nYour previous attempt returned ${chapters.length} chapters. That is wrong. Return EXACTLY ${chapterCount} chapters this time, still covering every key point exactly once.`,
        { temperature: 0.3 }
      );
      addUsage(retry.usage);
      try {
        const retried = parseChapters(retry.text);
        // Keep the retry only if it is no worse than the first attempt.
        if (Math.abs(retried.length - chapterCount) < Math.abs(chapters.length - chapterCount)) {
          chapters = retried;
        }
      } catch {
        // Malformed retry — keep the first attempt and let reconcile fix it.
      }
    }

    // Structural guarantee: exact count, every key point homed exactly once.
    const { chapters: finalChapters, adjusted } = reconcileOutline(chapters, chapterCount, keyPoints.length);
    if (adjusted) {
      logger.warn("Outline reconciled to the requested shape", {
        route: "/api/outline",
        userId: user.id,
        meta: { project_id, requested: chapterCount, final: finalChapters.length },
      });
    }

    // Delete existing chapters for this project
    await supabase.from("chapters").delete().eq("project_id", project_id);

    // Insert new chapters
    const { data: inserted, error } = await supabase
      .from("chapters")
      .insert(
        finalChapters.map((ch, i) => ({
          project_id,
          chapter_number: i + 1,
          title: ch.title,
          summary: ch.summary,
          key_point_ids: ch.key_point_ids
            .map((idx: number) => keyPoints[idx - 1]?.id)
            .filter(Boolean),
          target_word_count: targetWordsPerChapter,
          sort_order: i,
        }))
      )
      .select();

    if (error) throw error;

    // Bill after the outline is known-good (parse-before-bill). Covers both the
    // first attempt and the corrective retry. A settle failure is a loud log
    // line, never a customer-facing error on work already delivered.
    await recordInkUsage(user.id, project_id, "outline", "quality", totalUsage).catch((billErr) =>
      logger.error("outline: Ink settle failed after successful generation", {
        route: "/api/outline",
        userId: user.id,
        error: billErr,
        meta: { project_id },
      })
    );

    return NextResponse.json(inserted);
  } catch (err) {
    // The vendor calls happened even if parsing or insertion did not — bill for
    // what was actually consumed rather than eating it.
    if (totalUsage.input_tokens > 0 || totalUsage.output_tokens > 0) {
      await recordInkUsage(user.id, project_id, "outline", "quality", totalUsage).catch(() => {});
    }
    const message = err instanceof Error ? err.message : "Failed to parse outline";
    logger.error(message, {
      route: "/api/outline",
      userId: user.id,
      error: err,
      meta: { project_id },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
