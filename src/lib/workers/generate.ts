import { createServerClient } from "@/lib/supabase";
import { updateJob } from "@/lib/jobs";
import {
  askClaude,
  creativeFreedomToTemp,
  creativeFreedomToInstruction,
} from "@/lib/claude-lite";
import { generateSystem, generatePrompt, HUMANIZER_RULES } from "@/lib/prompts/generate";
import { extractExcerptsForChapter } from "@/lib/chunker";

export async function runGenerateJob(
  jobId: string,
  input: {
    chapter_id?: string;
    project_id?: string;
    generate_type?: string;
    creative_freedom?: number;
    chapters?: { title: string; summary: string }[];
  }
) {
  const supabase = createServerClient();
  const creativeFreedom = input.creative_freedom ?? 50;

  try {
    await updateJob(jobId, { status: "running", progress: { step: "preparing" } });

    // Foreword generation
    if (input.generate_type === "foreword" && input.project_id) {
      await updateJob(jobId, { progress: { step: "generating_foreword" } });

      const { data: project } = await supabase
        .from("projects").select("*").eq("id", input.project_id).single();
      if (!project) throw new Error("Project not found");

      const chaptersInfo = (input.chapters || [])
        .map((ch, i) => `Chapter ${i + 1}: ${ch.title}\n${ch.summary}`)
        .join("\n\n");

      const temperature = creativeFreedomToTemp(creativeFreedom);
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
        .eq("project_id", input.project_id).eq("chapter_number", 0);

      const { data: forewordChapter } = await supabase.from("chapters").insert({
        project_id: input.project_id,
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
          generation_params: { creative_freedom: creativeFreedom, type: "foreword" },
          version: 1,
        });
      }

      await updateJob(jobId, {
        status: "completed",
        result: { foreword: true, word_count: content.split(/\s+/).length },
      });
      return;
    }

    // Chapter generation
    if (!input.chapter_id) throw new Error("chapter_id required");

    const { data: chapter } = await supabase
      .from("chapters").select("*").eq("id", input.chapter_id).single();
    if (!chapter) throw new Error("Chapter not found");

    await updateJob(jobId, { progress: { step: "loading_context" } });

    const [projectRes, transcriptRes, keyPointsRes, enrichRes, prevChaptersRes, prevChapterContentRes] =
      await Promise.all([
        supabase.from("projects").select("*").eq("id", chapter.project_id).single(),
        supabase.from("transcripts").select("full_text").eq("project_id", chapter.project_id),
        supabase.from("key_points").select("*").in("id", chapter.key_point_ids || []),
        supabase.from("enrichments").select("*").eq("chapter_id", input.chapter_id),
        supabase.from("chapters").select("title, summary")
          .eq("project_id", chapter.project_id)
          .lt("chapter_number", chapter.chapter_number)
          .order("chapter_number"),
        (async () => {
          if (chapter.chapter_number <= 1) return { data: null };
          const { data: prevCh } = await supabase
            .from("chapters").select("id")
            .eq("project_id", chapter.project_id)
            .eq("chapter_number", chapter.chapter_number - 1)
            .single();
          if (!prevCh) return { data: null };
          return supabase.from("chapter_contents").select("content")
            .eq("chapter_id", prevCh.id)
            .order("version", { ascending: false })
            .limit(1).single();
        })(),
      ]);

    const project = projectRes.data;
    if (!project) throw new Error("Project not found");

    const transcripts = transcriptRes.data || [];
    const keyPoints = keyPointsRes.data || [];
    const enrichments = enrichRes.data || [];
    const previousChapters = prevChaptersRes.data || [];

    let previousChapterTail = "";
    if (prevChapterContentRes?.data?.content) {
      const words = prevChapterContentRes.data.content.split(/\s+/);
      previousChapterTail = words.slice(-500).join(" ");
    }

    const fullText = transcripts.map((t) => t.full_text).join("\n\n");
    const excerpts = extractExcerptsForChapter(
      fullText,
      keyPoints.map((kp) => kp.supporting_quotes || [])
    );

    const tracker = project.narrative_tracker;
    const coveredPoints = tracker?.covered_points || [];
    const narrativeThread = tracker?.arc_position || undefined;

    // Mark generating
    await supabase.from("chapters").update({ status: "generating" }).eq("id", input.chapter_id);
    await updateJob(jobId, { progress: { step: "generating", chapter: chapter.chapter_number } });

    const temperature = creativeFreedomToTemp(creativeFreedom);
    const freedomInstruction = creativeFreedomToInstruction(creativeFreedom);

    const system = generateSystem(project.voice_profile);
    const prompt = generatePrompt({
      chapterNumber: chapter.chapter_number,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      transcriptExcerpts: excerpts,
      keyPoints: keyPoints.map((kp) => ({ id: kp.id, title: kp.title, summary: kp.summary })),
      blendedKeyPointIds: chapter.blended_key_point_ids || [],
      enrichments,
      previousChapters,
      coveredPoints,
      narrativeThread,
      previousChapterTail: previousChapterTail || undefined,
      targetWords: chapter.target_word_count,
      audience: project.audience,
      freedomInstruction,
    });

    const content = await askClaude(system, prompt, { temperature, maxTokens: 16384 });
    const wordCount = content.split(/\s+/).length;

    // Get next version number
    const { data: existing } = await supabase
      .from("chapter_contents")
      .select("version")
      .eq("chapter_id", input.chapter_id)
      .order("version", { ascending: false })
      .limit(1);

    const nextVersion = (existing?.[0]?.version || 0) + 1;

    const { data: saved, error: saveErr } = await supabase
      .from("chapter_contents")
      .insert({
        chapter_id: input.chapter_id,
        content,
        word_count: wordCount,
        generation_params: {
          creative_freedom: creativeFreedom,
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
    await supabase.from("chapters").update({ status: "generated" }).eq("id", input.chapter_id);

    const newCoveredPoints = [...coveredPoints, ...keyPoints.map((kp) => kp.title)];
    const newChapterSummaries = [
      ...(tracker?.chapter_summaries || []),
      { chapter: chapter.chapter_number, title: chapter.title, summary: chapter.summary },
    ];

    await supabase.from("projects").update({
      narrative_tracker: {
        themes: tracker?.themes || [],
        covered_points: newCoveredPoints,
        arc_position: `After chapter ${chapter.chapter_number}`,
        chapter_summaries: newChapterSummaries,
      },
    }).eq("id", chapter.project_id);

    await updateJob(jobId, {
      status: "completed",
      result: saved,
    });
  } catch (err) {
    // Reset chapter status on failure
    if (input.chapter_id) {
      const supabase2 = createServerClient();
      await supabase2.from("chapters").update({ status: "outlined" }).eq("id", input.chapter_id);
    }
    const message = err instanceof Error ? err.message : "Generation failed";
    await updateJob(jobId, { status: "failed", error: message });
  }
}
