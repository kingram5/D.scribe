import { createServerClient } from "@/lib/supabase";

export type JobType = "analyze" | "outline" | "generate" | "coherence";

export interface Job {
  id: string;
  project_id: string;
  type: JobType;
  status: "pending" | "running" | "completed" | "failed";
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  progress: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** Create a new job row and return it */
export async function createJob(
  projectId: string,
  type: JobType,
  input: Record<string, unknown>
): Promise<Job> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert({ project_id: projectId, type, input })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create job");
  }
  return data as Job;
}

/** Get a job by ID */
export async function getJob(jobId: string): Promise<Job | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  return data as Job | null;
}

/** Update job status, progress, result, or error */
export async function updateJob(
  jobId: string,
  updates: Partial<Pick<Job, "status" | "progress" | "result" | "error">>
) {
  const supabase = createServerClient();
  await supabase.from("jobs").update(updates).eq("id", jobId);
}
