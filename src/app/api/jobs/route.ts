import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createJob, type JobType } from "@/lib/jobs";
import { checkCredits, deductCredit } from "@/lib/credits";
import { createServerClient } from "@/lib/supabase";
import { runAnalyzeJob } from "@/lib/workers/analyze";
import { runOutlineJob } from "@/lib/workers/outline";
import { runGenerateJob } from "@/lib/workers/generate";
import { runCoherenceJob } from "@/lib/workers/coherence";
import { runGenerateAllJob } from "@/lib/workers/generate-all";

const VALID_TYPES: JobType[] = ["analyze", "outline", "generate", "generate-all", "coherence"];

// POST /api/jobs — kick off a background job
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, project_id, ...rest } = body;

  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `Invalid job type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!project_id) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  // Get the project owner for credit check
  const supabase = createServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("user_id")
    .eq("id", project_id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Check credits before creating job
  const creditCheck = await checkCredits(project.user_id);
  if (!creditCheck.allowed) {
    return NextResponse.json(
      { error: creditCheck.reason, credits_remaining: creditCheck.balance },
      { status: 402 }
    );
  }

  const job = await createJob(project_id, type, { project_id, ...rest });

  // Deduct 1 credit
  await deductCredit(project.user_id);

  // Fire-and-forget: run the worker after the response is sent
  after(async () => {
    switch (type) {
      case "analyze":
        await runAnalyzeJob(job.id, { project_id, ...rest });
        break;
      case "outline":
        await runOutlineJob(job.id, { project_id, ...rest });
        break;
      case "generate":
        await runGenerateJob(job.id, { project_id, ...rest });
        break;
      case "coherence":
        await runCoherenceJob(job.id, { project_id });
        break;
      case "generate-all":
        await runGenerateAllJob(job.id, { project_id, ...rest });
        break;
    }
  });

  return NextResponse.json({ job_id: job.id }, { status: 202 });
}
