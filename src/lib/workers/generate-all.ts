import { createServerClient } from "@/lib/supabase";
import { updateJob } from "@/lib/jobs";
import { runGenerateJob } from "./generate";
import { runCoherenceJob } from "./coherence";

export async function runGenerateAllJob(
  jobId: string,
  input: {
    project_id: string;
    creative_freedom?: number;
  }
) {
  const supabase = createServerClient();

  try {
    await updateJob(jobId, {
      status: "running",
      progress: { step: "loading_chapters" },
    });

    // Get all chapters ordered by sort_order
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id, chapter_number, title, status")
      .eq("project_id", input.project_id)
      .gt("chapter_number", 0) // skip foreword
      .order("sort_order");

    if (!chapters?.length) throw new Error("No chapters found");

    const total = chapters.length;

    // Generate each chapter sequentially
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];

      await updateJob(jobId, {
        progress: {
          step: "generating",
          current: i + 1,
          total,
          chapterTitle: ch.title,
          message: `Writing chapter ${i + 1} of ${total}: ${ch.title}`,
        },
      });

      // Use a sub-job ID pattern — we call the generate worker directly
      // but update the parent job's progress, not a child job
      const subJobId = `${jobId}_ch${ch.chapter_number}`;

      // Create a temporary job row for the generate worker to update
      const { data: subJob } = await supabase
        .from("jobs")
        .insert({
          project_id: input.project_id,
          type: "generate",
          input: {
            chapter_id: ch.id,
            project_id: input.project_id,
            creative_freedom: input.creative_freedom ?? 50,
          },
        })
        .select()
        .single();

      if (!subJob) throw new Error(`Failed to create sub-job for chapter ${ch.chapter_number}`);

      // Run the generate worker (this blocks until complete)
      await runGenerateJob(subJob.id, {
        chapter_id: ch.id,
        project_id: input.project_id,
        creative_freedom: input.creative_freedom ?? 50,
      });

      // Check if the sub-job failed
      const { data: completedJob } = await supabase
        .from("jobs")
        .select("status, error")
        .eq("id", subJob.id)
        .single();

      if (completedJob?.status === "failed") {
        throw new Error(
          `Chapter ${ch.chapter_number} failed: ${completedJob.error || "Unknown error"}`
        );
      }
    }

    // All chapters generated — run coherence pass
    await updateJob(jobId, {
      progress: {
        step: "coherence",
        message: "Smoothing transitions between chapters...",
        current: total,
        total,
      },
    });

    // Create a sub-job for coherence
    const { data: coherenceSubJob } = await supabase
      .from("jobs")
      .insert({
        project_id: input.project_id,
        type: "coherence",
        input: { project_id: input.project_id },
      })
      .select()
      .single();

    if (coherenceSubJob) {
      await runCoherenceJob(coherenceSubJob.id, {
        project_id: input.project_id,
      });
    }

    await updateJob(jobId, {
      status: "completed",
      progress: {
        step: "done",
        message: "All chapters generated and polished",
        current: total,
        total,
      },
      result: {
        chapters_generated: total,
        coherence_applied: true,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generate all failed";
    await updateJob(jobId, { status: "failed", error: message });
  }
}
