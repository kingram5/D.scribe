import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createJob, updateJob, type JobType } from "@/lib/jobs";
import { checkCredits, deductCredit } from "@/lib/credits";
import { createServerClient } from "@/lib/supabase";
import { runAnalyzeJob } from "@/lib/workers/analyze";
import { runOutlineJob } from "@/lib/workers/outline";
import { runGenerateJob } from "@/lib/workers/generate";
import { runCoherenceJob } from "@/lib/workers/coherence";
import { runGenerateAllJob } from "@/lib/workers/generate-all";
import { requireAuth } from "@/lib/auth";

const VALID_TYPES: JobType[] = ["analyze", "outline", "generate", "generate-all", "coherence"];

// POST /api/jobs — kick off a background job
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

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

  const supabase = createServerClient();

  // Get the project — verify it belongs to this user
  const { data: project } = await supabase
    .from("projects")
    .select("user_id")
    .eq("id", project_id)
    .eq("user_id", user.id)
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
  const runWorker = async () => {
    try {
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
    } catch (err) {
      console.error(`[jobs] Worker ${type} crashed:`, err);
      const { updateJob } = await import("@/lib/jobs");
      await updateJob(job.id, {
        status: "failed",
        error: err instanceof Error ? err.message : "Worker crashed unexpectedly",
      }).catch(() => {});
    }
  };

  if (process.env.NODE_ENV === "development") {
    // Dev mode: spawn standalone script to avoid Next.js OOM
    const stageMap: Record<string, string> = {
      analyze: "analyze",
      outline: "outline",
      generate: "generate",
      "generate-all": "all",
      coherence: "coherence",
    };
    const { spawn } = await import("child_process");
    const { resolve } = await import("path");
    const script = resolve(process.cwd(), "scripts/run-pipeline.mjs");
    const child = spawn("node", [script, project_id, stageMap[type] || type], {
      stdio: "inherit",
      detached: true,
    });
    child.unref();
    // Update job status when child exits
    child.on("close", async (code) => {
      await updateJob(job.id, {
        status: code === 0 ? "completed" : "failed",
        error: code !== 0 ? `Pipeline exited with code ${code}` : undefined,
      });
    });
  } else {
    after(runWorker);
  }

  return NextResponse.json({ job_id: job.id }, { status: 202 });
}
