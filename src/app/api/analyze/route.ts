import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { askClaudeWithUsage, cleanJson, type ClaudeUsage } from "@/lib/claude-lite";
import { logger } from "@/lib/logger";
import { chunkTranscript } from "@/lib/chunker";
import { KEY_POINTS_SYSTEM, keyPointsPrompt } from "@/lib/prompts/key-points";
import {
  VOICE_PROFILE_SYSTEM,
  voiceProfilePrompt,
} from "@/lib/prompts/voice-profile";
import { MIND_MAP_SYSTEM, mindMapPrompt } from "@/lib/prompts/mind-map";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkInk, recordInkUsage } from "@/lib/ink";

export const maxDuration = 60;

// POST /api/analyze — extract key points, voice profile, and mind map
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "analyze");
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }

  // Pre-flight Ink check — /api/analyze was entirely unmetered before.
  const inkCheck = await checkInk(user.id, "analyze");
  if (!inkCheck.allowed) {
    return NextResponse.json({ error: "out_of_ink", message: inkCheck.reason }, { status: 402 });
  }

  const { project_id, transcript_id } = await req.json();
  if (!project_id || !transcript_id) {
    return NextResponse.json(
      { error: "project_id and transcript_id required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Verify the project belongs to this user
  const { data: projectOwner } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!projectOwner) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get transcript
  const { data: transcript, error: txErr } = await supabase
    .from("transcripts")
    .select("*")
    .eq("id", transcript_id)
    .eq("project_id", project_id)
    .single();

  if (txErr || !transcript) {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }

  // Get existing project for voice profile
  const { data: project } = await supabase
    .from("projects")
    .select("voice_profile")
    .eq("id", project_id)
    .single();

  // Step 1: Extract key points from chunked transcript
  const chunks = chunkTranscript(transcript.full_text);
  const allKeyPoints: {
    title: string;
    summary: string;
    supporting_quotes: string[];
    tags: string[];
  }[] = [];
  let kpInputTokens = 0;
  let kpOutputTokens = 0;

  for (const chunk of chunks) {
    const previousTitles = allKeyPoints.map((kp) => kp.title);
    const prompt = keyPointsPrompt(
      chunk.text,
      chunk.index,
      chunk.totalChunks,
      previousTitles
    );

    const { text: raw, usage } = await askClaudeWithUsage(KEY_POINTS_SYSTEM, prompt, { model: "fast", maxTokens: 4096 });
    kpInputTokens += usage.input_tokens;
    kpOutputTokens += usage.output_tokens;
    try {
      const parsed = JSON.parse(cleanJson(raw));
      allKeyPoints.push(...parsed);
    } catch (err) {
      logger.error("Failed to parse key points chunk", {
        route: "/api/analyze",
        userId: user.id,
        error: err,
        meta: { chunkIndex: chunk.index, project_id },
      });
    }
  }

  // Meter the key-points extraction (all chunks). Voice + mind-map metered in their promises below.
  if (chunks.length > 0) {
    await recordInkUsage(user.id, project_id, "analyze", "fast", {
      input_tokens: kpInputTokens,
      output_tokens: kpOutputTokens,
    });
  }

  // Save key points to DB
  if (allKeyPoints.length > 0) {
    await supabase.from("key_points").insert(
      allKeyPoints.map((kp) => ({
        project_id,
        transcript_id,
        title: kp.title,
        summary: kp.summary,
        supporting_quotes: kp.supporting_quotes,
        tags: kp.tags,
        relevance_score: 0.8,
      }))
    );
  }

  // Voice + mind-map usage is captured here and charged AFTER Promise.all (sequentially),
  // so a failure in one parallel branch can't mask or race the other's charge.
  let voiceUsage: ClaudeUsage | null = null;
  let mindMapUsage: ClaudeUsage | null = null;

  // Step 2: Voice profile (run in parallel with mind map)
  const voicePromise = (async () => {
    // Take 3 samples from the transcript (~1000 words each)
    const words = transcript.full_text.split(/\s+/);
    const sampleSize = Math.min(1000, Math.floor(words.length / 3));
    const samples = [
      words.slice(0, sampleSize).join(" "),
      words.slice(Math.floor(words.length / 3), Math.floor(words.length / 3) + sampleSize).join(" "),
      words.slice(-sampleSize).join(" "),
    ];

    const { text: raw, usage } = await askClaudeWithUsage(
      VOICE_PROFILE_SYSTEM,
      voiceProfilePrompt(samples, project?.voice_profile),
      { model: "fast", maxTokens: 2048 }
    );
    voiceUsage = usage;
    try {
      const profile = JSON.parse(cleanJson(raw));
      await supabase
        .from("projects")
        .update({ voice_profile: profile })
        .eq("id", project_id);
      return profile;
    } catch {
      return null;
    }
  })();

  // Step 3: Mind map
  const mindMapPromise = (async () => {
    if (allKeyPoints.length === 0) return null;

    const { text: raw, usage } = await askClaudeWithUsage(
      MIND_MAP_SYSTEM,
      mindMapPrompt(
        allKeyPoints.map((kp) => ({
          title: kp.title,
          summary: kp.summary,
          tags: kp.tags,
        }))
      ),
      { model: "fast", maxTokens: 4096 }
    );
    mindMapUsage = usage;
    try {
      const { nodes, edges } = JSON.parse(cleanJson(raw));

      // Save nodes
      if (nodes?.length) {
        await supabase.from("mind_map_nodes").insert(
          nodes.map((n: Record<string, unknown>) => ({
            id: n.id,
            project_id,
            label: n.label,
            description: n.description || "",
            node_type: n.node_type || "subtopic",
            position_x: 0,
            position_y: 0,
            parent_id: n.parent_id || null,
            key_point_id: null,
          }))
        );
      }

      // Save edges
      if (edges?.length) {
        await supabase.from("mind_map_edges").insert(
          edges.map((e: Record<string, unknown>) => ({
            project_id,
            source_id: e.source_id,
            target_id: e.target_id,
            label: e.label || "",
            edge_type: e.edge_type || "related",
          }))
        );
      }

      return { nodes, edges };
    } catch {
      return null;
    }
  })();

  // allSettled (not all) so a rejection in one branch can't short-circuit and skip the billing
  // block below — which would ship the OTHER branch's completed, DB-written work unbilled.
  const [voiceResult, mindMapResult] = await Promise.allSettled([voicePromise, mindMapPromise]);

  // Bill every branch that completed its Claude call (usage captured), even if its sibling failed.
  if (voiceUsage) await recordInkUsage(user.id, project_id, "voice_profile", "fast", voiceUsage);
  if (mindMapUsage) await recordInkUsage(user.id, project_id, "mind_map", "fast", mindMapUsage);

  // Surface a branch failure (e.g. a Claude API error) as a request error — AFTER billing.
  if (voiceResult.status === "rejected") throw voiceResult.reason;
  if (mindMapResult.status === "rejected") throw mindMapResult.reason;

  const voiceProfile = voiceResult.value;
  const mindMap = mindMapResult.value;

  // Update project status
  await supabase
    .from("projects")
    .update({ status: "in_progress" })
    .eq("id", project_id);

  return NextResponse.json({
    key_points_count: allKeyPoints.length,
    voice_profile: voiceProfile,
    mind_map: mindMap,
  });
}
