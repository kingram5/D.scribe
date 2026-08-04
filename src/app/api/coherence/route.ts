import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { askClaudeWithUsage, cleanJson } from "@/lib/claude-lite";
import { HUMANIZER_RULES } from "@/lib/prompts/generate";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkInk, recordInkUsage } from "@/lib/ink";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

// POST /api/coherence — synchronous coherence pass, no job queue
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "coherence");
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
  const inkCheck = await checkInk(user.id, "coherence");
  if (!inkCheck.allowed) {
    return NextResponse.json(
      { error: "out_of_ink", message: inkCheck.reason },
      { status: 402 }
    );
  }

  const { project_id } = await req.json();
  if (!project_id) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Get project + verify ownership
  const { data: project } = await supabase
    .from("projects").select("*").eq("id", project_id).eq("user_id", user.id).single();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: chapters } = await supabase
    .from("chapters").select("*").eq("project_id", project_id).order("sort_order");
  if (!chapters?.length) {
    return NextResponse.json({ error: "No chapters found" }, { status: 400 });
  }

  // Fetch latest content for each chapter
  const chapterBoundaries: {
    id: string;
    number: number;
    title: string;
    firstParagraph: string;
    lastParagraph: string;
  }[] = [];

  for (const ch of chapters) {
    const { data: content } = await supabase
      .from("chapter_contents")
      .select("content")
      .eq("chapter_id", ch.id)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (!content?.content) continue;

    const paragraphs = content.content.split(/\n\n+/).filter((p: string) => p.trim().length > 50);
    chapterBoundaries.push({
      id: ch.id,
      number: ch.chapter_number,
      title: ch.title,
      firstParagraph: paragraphs[0] || "",
      lastParagraph: paragraphs[paragraphs.length - 1] || "",
    });
  }

  if (chapterBoundaries.length < 2) {
    return NextResponse.json({ error: "Need at least 2 chapters for coherence pass" }, { status: 400 });
  }

  // Build the coherence prompt
  const boundaryContext = chapterBoundaries.map((ch, i) => {
    let section = `--- Chapter ${ch.number}: "${ch.title}" ---\n`;
    section += `CLOSING PARAGRAPH:\n${ch.lastParagraph}\n`;
    if (i < chapterBoundaries.length - 1) {
      const next = chapterBoundaries[i + 1];
      section += `\n--- Chapter ${next.number}: "${next.title}" ---\n`;
      section += `OPENING PARAGRAPH:\n${next.firstParagraph}`;
    }
    return section;
  }).join("\n\n===== TRANSITION =====\n\n");

  const voiceNote = project.voice_profile
    ? `Match this voice: ${project.voice_profile.tone || ""}, formality ${project.voice_profile.formality_score || 3}/5.`
    : "";

  const { text: raw, usage } = await askClaudeWithUsage(
    `You are a book editor specializing in narrative coherence and chapter transitions. ${voiceNote} Maintain the author's authentic voice while improving flow.\n${HUMANIZER_RULES}`,
    `Review the transitions between chapters in this book. For each chapter boundary, provide revised closing and opening paragraphs that create smooth, natural transitions.

Look for:
- Thematic callbacks that could connect chapters
- Tone/energy mismatches between a chapter's ending and the next chapter's opening
- Opportunities to create anticipation or forward momentum
- Redundant phrases or ideas that appear across boundaries
- Places where a metaphor or thread could carry across chapters

Here are the chapter boundaries:

${boundaryContext}

Return a JSON array where each object has:
- transition_index: the index of the transition (0 = between chapter 1 and 2, etc.)
- revised_closing: the revised closing paragraph for the earlier chapter (or null if no change needed)
- revised_opening: the revised opening paragraph for the later chapter (or null if no change needed)
- note: brief explanation of what you changed and why

Only include transitions that need changes. If a transition is already smooth, skip it.
Return ONLY valid JSON.`,
    { maxTokens: 8192, model: "quality" }
  );

  // Parse BEFORE billing (edge-test 19/50): a max_tokens-truncated response
  // used to deduct Ink at this point and THEN fail the parse — the user paid
  // and received an error.
  let transitions: {
    transition_index: number;
    revised_closing: string | null;
    revised_opening: string | null;
    note: string;
  }[] = [];

  try {
    transitions = JSON.parse(cleanJson(raw));
  } catch (parseErr) {
    logger.error("coherence: unparseable model output — not billed", {
      route: "/api/coherence", userId: user.id, error: parseErr,
    });
    return NextResponse.json(
      { error: "The model returned an incomplete result — please try again" },
      { status: 502 }
    );
  }

  // Bill once the output is known-good. The result ships either way — a
  // billing failure is a loud log line, not a customer-facing error.
  await recordInkUsage(user.id, project_id, "coherence", "quality", usage).catch((billErr) =>
    logger.error("coherence: Ink settle failed after successful parse", {
      route: "/api/coherence", userId: user.id, error: billErr,
    })
  );

  // Apply the transitions
  let appliedCount = 0;
  for (const t of transitions) {
    const closingChapter = chapterBoundaries[t.transition_index];
    const openingChapter = chapterBoundaries[t.transition_index + 1];

    if (!closingChapter || !openingChapter) continue;

    // Update closing paragraph
    if (t.revised_closing && closingChapter) {
      const { data: content } = await supabase
        .from("chapter_contents")
        .select("id, content, version")
        .eq("chapter_id", closingChapter.id)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      if (content) {
        const paragraphs = content.content.split(/\n\n+/);
        paragraphs[paragraphs.length - 1] = t.revised_closing;
        const newContent = paragraphs.join("\n\n");

        await supabase.from("chapter_contents").insert({
          chapter_id: closingChapter.id,
          content: newContent,
          word_count: newContent.split(/\s+/).length,
          generation_params: { coherence_pass: true },
          version: content.version + 1,
        });
        appliedCount++;
      }
    }

    // Update opening paragraph
    if (t.revised_opening && openingChapter) {
      const { data: content } = await supabase
        .from("chapter_contents")
        .select("id, content, version")
        .eq("chapter_id", openingChapter.id)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      if (content) {
        const paragraphs = content.content.split(/\n\n+/);
        paragraphs[0] = t.revised_opening;
        const newContent = paragraphs.join("\n\n");

        await supabase.from("chapter_contents").insert({
          chapter_id: openingChapter.id,
          content: newContent,
          word_count: newContent.split(/\s+/).length,
          generation_params: { coherence_pass: true },
          version: content.version + 1,
        });
        appliedCount++;
      }
    }
  }

  return NextResponse.json({
    transitions_found: transitions.length,
    chapters_updated: appliedCount,
    details: transitions.map((t) => t.note),
  });
}
