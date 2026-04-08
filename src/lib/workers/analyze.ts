import { createServerClient } from "@/lib/supabase";
import { updateJob } from "@/lib/jobs";
import { askClaudeWithUsage, cleanJson } from "@/lib/claude-lite";
import { chunkTranscript } from "@/lib/chunker";
import { KEY_POINTS_SYSTEM, keyPointsPrompt } from "@/lib/prompts/key-points";
import { VOICE_PROFILE_SYSTEM, voiceProfilePrompt } from "@/lib/prompts/voice-profile";
import { MIND_MAP_SYSTEM, mindMapPrompt } from "@/lib/prompts/mind-map";
import { recordInkUsage } from "@/lib/ink";

export async function runAnalyzeJob(
  jobId: string,
  input: { project_id: string; transcript_id: string }
) {
  const supabase = createServerClient();

  try {
    await updateJob(jobId, { status: "running", progress: { step: "loading" } });

    // Get transcript
    const { data: transcript } = await supabase
      .from("transcripts")
      .select("*")
      .eq("id", input.transcript_id)
      .single();

    if (!transcript) throw new Error("Transcript not found");

    // Get existing project for voice profile + user_id
    const { data: project } = await supabase
      .from("projects")
      .select("voice_profile, user_id")
      .eq("id", input.project_id)
      .single();

    const userId = project?.user_id;

    // Step 1: Extract key points from chunked transcript
    const chunks = chunkTranscript(transcript.full_text);
    const allKeyPoints: {
      title: string;
      summary: string;
      supporting_quotes: string[];
      tags: string[];
    }[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      await updateJob(jobId, {
        progress: { step: "key_points", chunk: i + 1, totalChunks: chunks.length },
      });

      const previousTitles = allKeyPoints.map((kp) => kp.title);
      const prompt = keyPointsPrompt(chunk.text, chunk.index, chunk.totalChunks, previousTitles);
      const result = await askClaudeWithUsage(KEY_POINTS_SYSTEM, prompt, { model: "fast", maxTokens: 4096 });
      const raw = result.text;
      if (userId) await recordInkUsage(userId, input.project_id, "analyze", "fast", result.usage);

      try {
        const parsed = JSON.parse(cleanJson(raw));
        allKeyPoints.push(...parsed);
      } catch {
        console.error("Failed to parse key points chunk:", chunk.index);
      }
    }

    // Save key points to DB
    if (allKeyPoints.length > 0) {
      await supabase.from("key_points").insert(
        allKeyPoints.map((kp) => ({
          project_id: input.project_id,
          transcript_id: input.transcript_id,
          title: kp.title,
          summary: kp.summary,
          supporting_quotes: kp.supporting_quotes,
          tags: kp.tags,
          relevance_score: 0.8,
        }))
      );
    }

    await updateJob(jobId, { progress: { step: "voice_and_map" } });

    // Step 2 & 3: Voice profile + mind map in parallel
    const voicePromise = (async () => {
      const words = transcript.full_text.split(/\s+/);
      const sampleSize = Math.min(1000, Math.floor(words.length / 3));
      const samples = [
        words.slice(0, sampleSize).join(" "),
        words.slice(Math.floor(words.length / 3), Math.floor(words.length / 3) + sampleSize).join(" "),
        words.slice(-sampleSize).join(" "),
      ];

      const vpResult = await askClaudeWithUsage(
        VOICE_PROFILE_SYSTEM,
        voiceProfilePrompt(samples, project?.voice_profile),
        { model: "fast", maxTokens: 2048 }
      );
      const raw = vpResult.text;
      if (userId) await recordInkUsage(userId, input.project_id, "voice_profile", "fast", vpResult.usage);
      try {
        const profile = JSON.parse(cleanJson(raw));
        await supabase
          .from("projects")
          .update({ voice_profile: profile })
          .eq("id", input.project_id);
        return profile;
      } catch {
        return null;
      }
    })();

    const mindMapPromise = (async () => {
      if (allKeyPoints.length === 0) return null;

      const mmResult = await askClaudeWithUsage(
        MIND_MAP_SYSTEM,
        mindMapPrompt(
          allKeyPoints.map((kp) => ({ title: kp.title, summary: kp.summary, tags: kp.tags }))
        ),
        { model: "fast", maxTokens: 4096 }
      );
      const raw = mmResult.text;
      if (userId) await recordInkUsage(userId, input.project_id, "mind_map", "fast", mmResult.usage);
      try {
        const { nodes, edges } = JSON.parse(cleanJson(raw));

        if (nodes?.length) {
          await supabase.from("mind_map_nodes").insert(
            nodes.map((n: Record<string, unknown>) => ({
              id: n.id,
              project_id: input.project_id,
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

        if (edges?.length) {
          await supabase.from("mind_map_edges").insert(
            edges.map((e: Record<string, unknown>) => ({
              project_id: input.project_id,
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

    const [voiceProfile, mindMap] = await Promise.all([voicePromise, mindMapPromise]);

    // Update project status
    await supabase
      .from("projects")
      .update({ status: "in_progress" })
      .eq("id", input.project_id);

    await updateJob(jobId, {
      status: "completed",
      result: {
        key_points_count: allKeyPoints.length,
        voice_profile: voiceProfile,
        mind_map: mindMap,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    await updateJob(jobId, { status: "failed", error: message });
  }
}
