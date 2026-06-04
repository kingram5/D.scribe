import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { askClaudeWithUsage, cleanJson } from "@/lib/claude-lite";
import { logger } from "@/lib/logger";
import { OUTLINE_SYSTEM, expandOutlinePrompt } from "@/lib/prompts/outline";
import { requireAuth } from "@/lib/auth";
import { checkInk, recordInkUsage } from "@/lib/ink";

// POST /api/outline/expand
// Body { project_id, dry_run: true }     → Claude proposes new chapters, no DB writes
// Body { project_id, chapters: [...] }   → save provided chapters to DB
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const body = await req.json();
  const { project_id, dry_run, chapters: confirmedChapters } = body;

  if (!project_id) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const [projectRes, chaptersRes, keyPointsRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", project_id).eq("user_id", user.id).single(),
    supabase.from("chapters").select("*").eq("project_id", project_id).order("chapter_number"),
    supabase.from("key_points").select("*").eq("project_id", project_id).order("created_at"),
  ]);

  if (!projectRes.data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const project = projectRes.data;
  const existingChapters = chaptersRes.data || [];
  const allKeyPoints = keyPointsRes.data || [];

  // Compute unassigned key points
  const assignedIds = new Set(existingChapters.flatMap((c) => c.key_point_ids ?? []));
  const unassigned = allKeyPoints.filter((kp) => !assignedIds.has(kp.id));

  if (unassigned.length === 0) {
    return NextResponse.json({ error: "No unassigned key points found." }, { status: 400 });
  }

  const maxExistingNumber = existingChapters.length > 0
    ? Math.max(...existingChapters.map((c) => c.chapter_number))
    : 0;

  // ── Confirm mode: save provided chapters ────────────────────────────────────
  if (!dry_run && confirmedChapters) {
    const targetWordsPerChapter = project.target_words_per_chapter || 2500;

    const toInsert = confirmedChapters.map(
      (ch: { title: string; summary: string; key_point_ids: string[] }, i: number) => ({
        project_id,
        chapter_number: maxExistingNumber + i + 1,
        title: ch.title,
        summary: ch.summary,
        key_point_ids: ch.key_point_ids,
        target_word_count: targetWordsPerChapter,
        sort_order: maxExistingNumber + i,
        status: "outlined",
      })
    );

    const { data: inserted, error } = await supabase
      .from("chapters")
      .insert(toInsert)
      .select();

    if (error) {
      logger.error("Failed to insert expanded chapters", { route: "/api/outline/expand", userId: user.id, error });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update narrative_tracker with new chapter summaries
    if (project.narrative_tracker) {
      const tracker = typeof project.narrative_tracker === "string"
        ? JSON.parse(project.narrative_tracker)
        : project.narrative_tracker;

      const newSummaries = (inserted || []).map((c: { chapter_number: number; title: string; summary: string }) => ({
        chapter: c.chapter_number,
        title: c.title,
        summary: c.summary,
      }));

      tracker.chapter_summaries = [...(tracker.chapter_summaries || []), ...newSummaries];
      tracker.arc_position = `After chapter ${maxExistingNumber + confirmedChapters.length}`;

      await supabase
        .from("projects")
        .update({ narrative_tracker: tracker })
        .eq("id", project_id);
    }

    return NextResponse.json(inserted);
  }

  // ── Dry-run mode: call Claude, return proposal ──────────────────────────────
  // Pre-flight Ink check (only dry-run calls Claude; confirm is a DB insert)
  const inkCheck = await checkInk(user.id);
  if (!inkCheck.allowed) {
    return NextResponse.json(
      { error: "out_of_ink", message: inkCheck.reason },
      { status: 402 }
    );
  }

  const numNewChapters = Math.max(1, Math.ceil(unassigned.length / 3));

  const { text: raw, usage } = await askClaudeWithUsage(
    OUTLINE_SYSTEM,
    expandOutlinePrompt(
      unassigned.map((kp) => ({ title: kp.title, summary: kp.summary })),
      numNewChapters,
      existingChapters.map((c) => ({
        chapter_number: c.chapter_number,
        title: c.title,
        summary: c.summary,
      })),
      project.audience,
      project.title,
      project.voice_profile
    ),
    { temperature: 0.5 }
  );

  // Meter the call — outline/expand dry-run was gate-only (checked balance > 0 but never deducted).
  await recordInkUsage(user.id, project_id, "outline", "quality", usage);

  try {
    const proposed = JSON.parse(cleanJson(raw));

    // Map 1-based indexes → UUIDs from unassigned array
    const mappedChapters = proposed.map(
      (ch: { title: string; summary: string; key_point_ids: number[]; narrative_arc: string }) => ({
        title: ch.title,
        summary: ch.summary,
        narrative_arc: ch.narrative_arc,
        key_point_ids: ch.key_point_ids
          .map((idx: number) => unassigned[idx - 1]?.id)
          .filter(Boolean),
      })
    );

    return NextResponse.json({
      proposed_chapters: mappedChapters,
      unassigned_count: unassigned.length,
      starts_at: maxExistingNumber + 1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse expanded outline";
    logger.error(message, { route: "/api/outline/expand", userId: user.id, error: err });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
