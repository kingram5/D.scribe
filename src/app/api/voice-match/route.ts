import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { lintAITells, buildVoiceBaseline, voiceMatchScore } from "@/lib/voice-match";

// POST /api/voice-match — score a chapter's latest content against the
// author's spoken baseline. Fully deterministic (no model call, no Ink).
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { chapter_id } = await req.json();
  if (!chapter_id) {
    return NextResponse.json({ error: "chapter_id required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, project_id")
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

  const { data: content } = await supabase
    .from("chapter_contents")
    .select("id, content, version, generation_params")
    .eq("chapter_id", chapter_id)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (!content || !content.content.trim()) {
    return NextResponse.json({ error: "Chapter has no content yet" }, { status: 404 });
  }

  const { data: transcripts } = await supabase
    .from("transcripts")
    .select("full_text")
    .eq("project_id", chapter.project_id);
  if (!transcripts || transcripts.length === 0) {
    return NextResponse.json(
      { error: "No transcripts to build a voice baseline from" },
      { status: 409 }
    );
  }

  const baseline = buildVoiceBaseline(
    transcripts.map((t) => t.full_text),
    project.voice_profile
  );
  const readsHuman = lintAITells(content.content);
  const voiceMatch = voiceMatchScore(content.content, baseline);

  const scores = {
    reads_human: readsHuman.score,
    voice_match: voiceMatch.score,
    version: content.version,
    computed_at: new Date().toISOString(),
  };

  // Cache on the content row so the editor can show scores without recompute
  await supabase
    .from("chapter_contents")
    .update({ generation_params: { ...content.generation_params, scores } })
    .eq("id", content.id);

  return NextResponse.json({
    scores,
    reads_human: {
      score: readsHuman.score,
      em_dashes: readsHuman.emDashes,
      banned_hits: readsHuman.bannedHits,
      negation_flips: readsHuman.negationFlips,
      rhetorical_transitions: readsHuman.rhetoricalTransitions,
      uniform_paragraphs: readsHuman.uniformParagraphs,
    },
    voice_match: {
      score: voiceMatch.score,
      components: voiceMatch.components,
      signature_hits: voiceMatch.signatureHits,
      baseline_words: voiceMatch.baseline.sourceWordCount,
    },
  });
}
