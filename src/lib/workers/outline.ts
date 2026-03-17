import { createServerClient } from "@/lib/supabase";
import { updateJob } from "@/lib/jobs";
import { askClaude, cleanJson } from "@/lib/claude";
import { OUTLINE_SYSTEM, outlinePrompt } from "@/lib/prompts/outline";

export async function runOutlineJob(
  jobId: string,
  input: { project_id: string; num_chapters?: number }
) {
  const supabase = createServerClient();

  try {
    await updateJob(jobId, { status: "running", progress: { step: "generating_outline" } });

    // Get project + key points
    const [projectRes, keyPointsRes] = await Promise.all([
      supabase.from("projects").select("*").eq("id", input.project_id).single(),
      supabase.from("key_points").select("*").eq("project_id", input.project_id).order("created_at"),
    ]);

    if (!projectRes.data) throw new Error("Project not found");
    const project = projectRes.data;
    const keyPoints = keyPointsRes.data || [];

    if (keyPoints.length === 0) throw new Error("No key points found. Run analysis first.");

    const chapterCount = input.num_chapters || Math.max(3, Math.ceil(keyPoints.length / 3));

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

    const chapters = JSON.parse(cleanJson(raw));

    // Delete existing chapters for this project
    await supabase.from("chapters").delete().eq("project_id", input.project_id);

    // Insert new chapters
    const { data: inserted, error } = await supabase
      .from("chapters")
      .insert(
        chapters.map(
          (ch: { title: string; summary: string; key_point_ids: number[] }, i: number) => ({
            project_id: input.project_id,
            chapter_number: i + 1,
            title: ch.title,
            summary: ch.summary,
            key_point_ids: ch.key_point_ids
              .map((idx: number) => keyPoints[idx - 1]?.id)
              .filter(Boolean),
            target_word_count: 3000,
            sort_order: i,
          })
        )
      )
      .select();

    if (error) throw error;

    await updateJob(jobId, {
      status: "completed",
      result: { chapters: inserted },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate outline";
    await updateJob(jobId, { status: "failed", error: message });
  }
}
