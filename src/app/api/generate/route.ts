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
import { checkInk, recordInkUsage } from "@/lib/ink";

export const maxDuration = 60;

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

// POST /api/generate — stream chapter or foreword generation as SSE
// Streaming keeps the Vercel connection alive past the 10s non-streaming limit.
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "generate");
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const inkCheck = await checkInk(user.id);
  if (!inkCheck.allowed) {
    return NextResponse.json({ error: "out_of_ink", message: inkCheck.reason }, { status: 402 });
  }

  const body = await req.json();
  const { creative_freedom = 50 } = body;
  const supabase = createServerClient();

  // ── Foreword: non-streaming (short, under 60s) ──
  if (body.type === "foreword" && body.project_id) {
    const { data: project } = await supabase
      .from("projects").select("*").eq("id", body.project_id).eq("user_id", user.id).single();
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
      `Write a foreword for a book titled "${project.title}" aimed at a ${project.audience || "General"} audience.\n\nThe book contains these chapters:\n${chaptersInfo}\n\nThe foreword should:\n- Welcome the reader and set the tone\n- Preview the journey ahead without spoiling key moments\n- Establish why these topics matter\n- Create anticipation for what's to come\n- Be warm, inviting, and authentic to the speaker's voice\n\nTarget: ~1500 words. Write the full foreword now.`,
      { temperature, maxTokens: 8192 }
    );

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

  // ── Chapter: streaming (long-running, keeps Vercel connection alive) ──
  const { chapter_id } = body;
  if (!chapter_id) return NextResponse.json({ error: "chapter_id required" }, { status: 400 });

  const { data: chapter, error: chErr } = await supabase
    .from("chapters").select("*").eq("id", chapter_id).single();
  if (chErr || !chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });

  const { data: projectOwner } = await supabase
    .from("projects").select("id").eq("id", chapter.project_id).eq("user_id", user.id).single();
  if (!projectOwner) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const [projectRes, transcriptRes, keyPointsRes, enrichRes, prevChaptersRes, prevChapterContentRes] =
    await Promise.all([
      supabase.from("projects").select("*").eq("id", chapter.project_id).single(),
      supabase.from("transcripts").select("full_text").eq("project_id", chapter.project_id),
      supabase.from("key_points").select("*").in("id", chapter.key_point_ids || []),
      supabase.from("enrichments").select("*").eq("chapter_id", chapter_id),
      supabase.from("chapters").select("title, summary").eq("project_id", chapter.project_id)
        .lt("chapter_number", chapter.chapter_number).order("chapter_number"),
      (async () => {
        if (chapter.chapter_number <= 1) return { data: null };
        const { data: prevCh } = await supabase.from("chapters").select("id")
          .eq("project_id", chapter.project_id).eq("chapter_number", chapter.chapter_number - 1).single();
        if (!prevCh) return { data: null };
        return supabase.from("chapter_contents").select("content")
          .eq("chapter_id", prevCh.id).order("version", { ascending: false }).limit(1).single();
      })(),
    ]);

  const project = projectRes.data;
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

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
  const excerpts = extractExcerptsForChapter(fullText, keyPoints.map((kp) => kp.supporting_quotes || []));

  const tracker = project.narrative_tracker;
  const coveredPoints = tracker?.covered_points || [];
  const narrativeThread = tracker?.arc_position || undefined;

  await supabase.from("chapters").update({ status: "generating" }).eq("id", chapter_id);

  const temperature = creativeFreedomToTemp(creative_freedom);
  const freedomInstruction = creativeFreedomToInstruction(creative_freedom);
  const system = generateSystem(project.voice_profile);
  const prompt = generatePrompt({
    chapterNumber: chapter.chapter_number,
    chapterTitle: chapter.title,
    chapterSummary: chapter.summary,
    transcriptExcerpts: excerpts,
    keyPoints: keyPoints.map((kp) => ({ title: kp.title, summary: kp.summary })),
    enrichments,
    previousChapters,
    coveredPoints,
    narrativeThread,
    previousChapterTail: previousChapterTail || undefined,
    targetWords: chapter.target_word_count,
    audience: project.audience,
    freedomInstruction,
  });

  // Stream from Anthropic API
  const anthropicRes = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      temperature,
      stream: true,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!anthropicRes.ok) {
    await supabase.from("chapters").update({ status: "outlined" }).eq("id", chapter_id);
    const err = await anthropicRes.text();
    return NextResponse.json({ error: `Claude API ${anthropicRes.status}: ${err.slice(0, 200)}` }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const reader = anthropicRes.body!.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      let fullContent = "";
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);
              if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                fullContent += event.delta.text;
                // Send heartbeat chunk to keep Vercel connection alive
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: event.delta.text })}\n\n`));
              }
              if (event.type === "message_start" && event.message?.usage) {
                inputTokens = event.message.usage.input_tokens || 0;
              }
              if (event.type === "message_delta" && event.usage) {
                outputTokens = event.usage.output_tokens || 0;
              }
            } catch { /* skip malformed */ }
          }
        }

        // Save the generated content
        const content = sanitizeGenerated(fullContent);
        const wordCount = content.split(/\s+/).length;

        const { data: existing } = await supabase.from("chapter_contents").select("version")
          .eq("chapter_id", chapter_id).order("version", { ascending: false }).limit(1);
        const nextVersion = (existing?.[0]?.version || 0) + 1;

        const { error: saveErr } = await supabase.from("chapter_contents").insert({
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
        });

        if (saveErr) throw saveErr;

        await supabase.from("chapters").update({ status: "generated" }).eq("id", chapter_id);

        // Update narrative tracker
        const newCoveredPoints = [...coveredPoints, ...keyPoints.map((kp) => kp.title)];
        await supabase.from("projects").update({
          narrative_tracker: {
            themes: tracker?.themes || [],
            covered_points: newCoveredPoints,
            arc_position: `After chapter ${chapter.chapter_number}`,
            chapter_summaries: [
              ...(tracker?.chapter_summaries || []),
              { chapter: chapter.chapter_number, title: chapter.title, summary: chapter.summary },
            ],
          },
        }).eq("id", chapter.project_id);

        // Record ink usage
        if (inputTokens > 0 || outputTokens > 0) {
          recordInkUsage(user.id, chapter.project_id, "generate", "quality", {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          }).catch(console.error);
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, chapter_id, word_count: wordCount })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();

      } catch (err) {
        await supabase.from("chapters").update({ status: "outlined" }).eq("id", chapter_id).catch(() => {});
        const message = err instanceof Error ? err.message : "Generation failed";
        logger.error(message, { route: "/api/generate", userId: user.id, error: err, meta: { chapter_id } });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
