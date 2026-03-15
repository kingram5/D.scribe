import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  askClaude,
  creativeFreedomToTemp,
  creativeFreedomToInstruction,
} from "@/lib/claude";
import { generateSystem, generatePrompt } from "@/lib/prompts/generate";
import { extractExcerptsForChapter } from "@/lib/chunker";

// POST /api/generate — generate a single chapter's content
export async function POST(req: NextRequest) {
  const { chapter_id, creative_freedom = 50 } = await req.json();
  if (!chapter_id) {
    return NextResponse.json({ error: "chapter_id required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Get chapter
  const { data: chapter, error: chErr } = await supabase
    .from("chapters")
    .select("*")
    .eq("id", chapter_id)
    .single();

  if (chErr || !chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  // Get project, transcripts, key points, enrichments, previous chapters
  const [projectRes, transcriptRes, keyPointsRes, enrichRes, prevChaptersRes] =
    await Promise.all([
      supabase.from("projects").select("*").eq("id", chapter.project_id).single(),
      supabase
        .from("transcripts")
        .select("full_text")
        .eq("project_id", chapter.project_id),
      supabase
        .from("key_points")
        .select("*")
        .in("id", chapter.key_point_ids || []),
      supabase
        .from("enrichments")
        .select("*")
        .eq("chapter_id", chapter_id),
      supabase
        .from("chapters")
        .select("title, summary")
        .eq("project_id", chapter.project_id)
        .lt("chapter_number", chapter.chapter_number)
        .order("chapter_number"),
    ]);

  const project = projectRes.data;
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const transcripts = transcriptRes.data || [];
  const keyPoints = keyPointsRes.data || [];
  const enrichments = enrichRes.data || [];
  const previousChapters = prevChaptersRes.data || [];

  // Extract relevant transcript excerpts
  const fullText = transcripts.map((t) => t.full_text).join("\n\n");
  const excerpts = extractExcerptsForChapter(
    fullText,
    keyPoints.map((kp) => kp.supporting_quotes || [])
  );

  // Build narrative context
  const tracker = project.narrative_tracker;
  const coveredPoints = tracker?.covered_points || [];
  const narrativeThread = tracker?.arc_position || undefined;

  // Mark generating
  await supabase
    .from("chapters")
    .update({ status: "generating" })
    .eq("id", chapter_id);

  try {
    const temperature = creativeFreedomToTemp(creative_freedom);
    const freedomInstruction = creativeFreedomToInstruction(creative_freedom);

    const system = generateSystem(project.voice_profile);
    const prompt = generatePrompt({
      chapterNumber: chapter.chapter_number,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      transcriptExcerpts: excerpts,
      keyPoints: keyPoints.map((kp) => ({
        title: kp.title,
        summary: kp.summary,
      })),
      enrichments,
      previousChapters,
      coveredPoints,
      narrativeThread,
      targetWords: chapter.target_word_count,
      audience: project.audience,
      freedomInstruction,
    });

    const content = await askClaude(system, prompt, {
      temperature,
      maxTokens: 16384,
    });

    const wordCount = content.split(/\s+/).length;

    // Get next version number
    const { data: existing } = await supabase
      .from("chapter_contents")
      .select("version")
      .eq("chapter_id", chapter_id)
      .order("version", { ascending: false })
      .limit(1);

    const nextVersion = (existing?.[0]?.version || 0) + 1;

    // Save content
    const { data: saved, error: saveErr } = await supabase
      .from("chapter_contents")
      .insert({
        chapter_id,
        content,
        word_count: wordCount,
        generation_params: {
          creative_freedom,
          audience: project.audience,
          target_words: chapter.target_word_count,
          include_enrichments: enrichments.some((e) => e.included),
        },
        version: nextVersion,
      })
      .select()
      .single();

    if (saveErr) throw saveErr;

    // Update chapter status and narrative tracker
    await supabase
      .from("chapters")
      .update({ status: "generated" })
      .eq("id", chapter_id);

    // Update narrative tracker
    const newCoveredPoints = [
      ...coveredPoints,
      ...keyPoints.map((kp) => kp.title),
    ];
    const newChapterSummaries = [
      ...(tracker?.chapter_summaries || []),
      {
        chapter: chapter.chapter_number,
        title: chapter.title,
        summary: chapter.summary,
      },
    ];

    await supabase
      .from("projects")
      .update({
        narrative_tracker: {
          themes: tracker?.themes || [],
          covered_points: newCoveredPoints,
          arc_position: `After chapter ${chapter.chapter_number}`,
          chapter_summaries: newChapterSummaries,
        },
      })
      .eq("id", chapter.project_id);

    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    await supabase
      .from("chapters")
      .update({ status: "outlined" })
      .eq("id", chapter_id);

    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
