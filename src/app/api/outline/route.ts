import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { askClaude, cleanJson } from "@/lib/claude-lite";
import { logger } from "@/lib/logger";
import { OUTLINE_SYSTEM, outlinePrompt } from "@/lib/prompts/outline";
import { requireAuth } from "@/lib/auth";

// POST /api/outline — generate chapter outline from key points
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

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

  const raw = await askClaude(
    OUTLINE_SYSTEM,
    outlinePrompt(
      keyPoints.map((kp) => ({ title: kp.title, summary: kp.summary })),
      chapterCount,
      project.audience,
      project.title,
      project.voice_profile
    ),
    { temperature: 0.5 }
  );

  try {
    const chapters = JSON.parse(cleanJson(raw));

    // Delete existing chapters for this project
    await supabase.from("chapters").delete().eq("project_id", project_id);

    // Insert new chapters
    const { data: inserted, error } = await supabase
      .from("chapters")
      .insert(
        chapters.map(
          (
            ch: { title: string; summary: string; key_point_ids: number[] },
            i: number
          ) => ({
            project_id,
            chapter_number: i + 1,
            title: ch.title,
            summary: ch.summary,
            key_point_ids: ch.key_point_ids.map(
              (idx: number) => keyPoints[idx - 1]?.id
            ).filter(Boolean),
            target_word_count: targetWordsPerChapter,
            sort_order: i,
          })
        )
      )
      .select();

    if (error) throw error;
    return NextResponse.json(inserted);
  } catch (err) {
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
