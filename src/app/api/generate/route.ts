import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  askClaude,
  creativeFreedomToTemp,
  creativeFreedomToInstruction,
} from "@/lib/claude-lite";
import { logger } from "@/lib/logger";
import { generateSystem, generatePrompt, HUMANIZER_RULES } from "@/lib/prompts/generate";
import { extractExcerptsForChapter } from "@/lib/chunker";
import { requireAuth } from "@/lib/auth";
import { sanitizeGenerated } from "@/lib/sanitize-output";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkInk } from "@/lib/ink";

// POST /api/generate — generate a chapter or foreword
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "generate");
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
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

  const body = await req.json();
  const { creative_freedom = 50 } = body;

  const supabase = createServerClient();

  // Foreword generation
  if (body.type === "foreword" && body.project_id) {
    // Verify project ownership
    const { data: project } = await supabase
      .from("projects")
      .select("*")
      .eq("id", body.project_id)
      .eq("user_id", user.id)
      .single();
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const chaptersInfo = (body.chapters || [])
      .map((ch: { title: string; summary: string }, i: number) => `Chapter ${i + 1}: ${ch.title}\n${ch.summary}`)
      .join("\n\n");

    const temperature = creativeFreedomToTemp(creative_freedom);
    const voiceNote = project.voice_profile
      ? `Match this voice: ${project.voice_profile.tone || ""}, formality ${project.voice_profile.formality_score || 3}/5.`
      : "";

    const content = await askClaude(
      `You are a skilled book ghostwriter. Write a compelling foreword/introduction chapter. ${voiceNote}\n${HUMANIZER_RULES}`,
      `Write a foreword for a book titled "${project.title}" aimed at a ${project.audience || "General"} audience.

The book contains these chapters:
${chaptersInfo}

The foreword should:
- Welcome the reader and set the tone
- Preview the journey ahead without spoiling key moments
- Establish why these topics matter
- Create anticipation for what's to come
- Be warm, inviting, and authentic to the speaker's voice

Target: ~1500 words. Write the full foreword now.`,
      { temperature, maxTokens: 8192 }
    );

    // Save as chapter 0
    await supabase.from("chapters").delete()
      .eq("project_id", body.project_id).eq("chapter_number", 0);

    const { data: forewordChapter } = await supabase.from("chapters").insert({
      project_id: body.project_id,
      chapter_number: 0,
      title: "Foreword",
      summary: "An introduction to the themes and journey ahead.",
      key_point_ids: [],
      target_word_count: 1500,
      sort_order: -1,
      status: "generated",
    }).select().single();

    if (forewordChapter) {
      await supabase.from("chapter_contents").insert({
        chapter_id: forewordChapter.id,
        content,
        word_count: content.split(/\s+/).length,
        generation_params: { creative_freedom, type: "foreword" },
        version: 1,
      });
    }

    return NextResponse.json({ foreword: true, word_count: content.split(/\s+/).length }, { status: 201 });
  }

  const { chapter_id } = body;
  if (!chapter_id) {
    return NextResponse.json({ error: "chapter_id required" }, { status: 400 });
  }

  // Get chapter
  const { data: chapter, error: chErr } = await supabase
    .from("chapters")
    .select("*")
    .eq("id", chapter_id)
    .single();

  if (chErr || !chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  // Verify the chapter's project belongs to this user
  const { data: projectOwner } = await supabase
    .from("projects")
    .select("id")
    .eq("id", chapter.project_id)
    .eq("user_id", user.id)
    .single();

  if (!projectOwner) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get project, transcripts, key points, enrichments, previous chapters, previous chapter content
  const [projectRes, transcriptRes, keyPointsRes, enrichRes, prevChaptersRes, prevChapterContentRes] =
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
      // Get the immediately previous chapter's generated content for tail context
      (async () => {
        if (chapter.chapter_number <= 1) return { data: null };
        const { data: prevCh } = await supabase
          .from("chapters")
          .select("id")
          .eq("project_id", chapter.project_id)
          .eq("chapter_number", chapter.chapter_number - 1)
          .single();
        if (!prevCh) return { data: null };
        return supabase
          .from("chapter_contents")
          .select("content")
          .eq("chapter_id", prevCh.id)
          .order("version", { ascending: false })
          .limit(1)
          .single();
      })(),
    ]);

  const project = projectRes.data;
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const transcripts = transcriptRes.data || [];
  const keyPoints = keyPointsRes.data || [];
  const enrichments = enrichRes.data || [];
  const previousChapters = prevChaptersRes.data || [];

  // Get tail of previous chapter for smooth transitions (~500 words)
  let previousChapterTail = "";
  if (prevChapterContentRes?.data?.content) {
    const words = prevChapterContentRes.data.content.split(/\s+/);
    previousChapterTail = words.slice(-500).join(" ");
  }

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
      previousChapterTail: previousChapterTail || undefined,
      targetWords: chapter.target_word_count,
      audience: project.audience,
      freedomInstruction,
    });

    const rawContent = await askClaude(system, prompt, {
      temperature,
      maxTokens: 16384,
    });

    // Post-generation sanitizer: catch em dashes and AI clichés that slip through
    const content = sanitizeGenerated(rawContent);

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
    logger.error(message, {
      route: "/api/generate",
      userId: user.id,
      error: err,
      meta: { chapter_id },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
