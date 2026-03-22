import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

// GET /api/jobs/[id] — poll job status
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const job = await getJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Verify the job's project belongs to this user
  const supabase = createServerClient();
  const { data: projectOwner } = await supabase
    .from("projects")
    .select("id")
    .eq("id", job.project_id)
    .eq("user_id", user.id)
    .single();

  if (!projectOwner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    result: job.status === "completed" ? job.result : undefined,
    error: job.status === "failed" ? job.error : undefined,
  });
}
