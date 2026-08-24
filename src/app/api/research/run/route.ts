import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkInk } from "@/lib/ink";
import { conversationDigest, isResearchRateLimited } from "@/lib/research-corpus";
import {
  assessTopic,
  chargeResearchInk,
  extractResearchItems,
  gatherPages,
  markJob,
  persistResearchItems,
} from "@/lib/research-pipeline";
import { isResearchEnabled } from "@/lib/research-search";
import { createServerClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ enabled: isResearchEnabled() });
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  if (!isResearchEnabled()) {
    return NextResponse.json({ disabled: true });
  }

  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.project_id === "string" ? body.project_id : "";
  const force = body.force === true;
  const digest = Array.isArray(body.digest) ? conversationDigest(body.digest) : [];

  if (!projectId) {
    return NextResponse.json({ skipped: true });
  }

  const supabase = createServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, title, audience")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ skipped: true });
  }

  const inkCheck = await checkInk(user.id, "research");
  if (!inkCheck.allowed) {
    return NextResponse.json({ skipped: true });
  }

  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: running } = await supabase
    .from("research_jobs")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .eq("status", "running")
    .gte("created_at", twoMinutesAgo)
    .limit(1);
  if (running && running.length > 0) {
    return NextResponse.json({ already_running: true });
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: hourCount } = await supabase
    .from("research_jobs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .in("status", ["running", "done", "failed"])
    .gte("created_at", hourAgo);
  const { count: dayCount } = await supabase
    .from("research_jobs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .in("status", ["running", "done", "failed"])
    .gte("created_at", dayAgo);
  if (isResearchRateLimited(hourCount ?? 0, dayCount ?? 0)) {
    return NextResponse.json({ rate_limited: true });
  }

  const { data: job, error: insertError } = await supabase
    .from("research_jobs")
    .insert({
      project_id: projectId,
      user_id: user.id,
      status: "running",
    })
    .select("id")
    .single();

  if (insertError || !job) {
    logger.error("research job insert failed", { route: "/api/research/run", userId: user.id, error: insertError });
    return NextResponse.json({ skipped: true });
  }

  try {
    const plan = await assessTopic(digest, project.title || "", project.audience || "");
    if (plan.confidence === "low" && !force) {
      await markJob(job.id, { status: "skipped", topic_summary: plan.topic_summary, queries: plan.queries });
      return NextResponse.json({ skipped: true });
    }

    const pages = await gatherPages(plan.queries);
    const items = await extractResearchItems(pages);
    const added = await persistResearchItems({
      projectId,
      userId: user.id,
      items,
    });
    await chargeResearchInk(user.id, projectId);
    await markJob(job.id, {
      status: "done",
      topic_summary: plan.topic_summary,
      queries: plan.queries,
      items_added: added,
    });
    return NextResponse.json({ done: true, items_added: added });
  } catch (err) {
    logger.error("research job failed", { route: "/api/research/run", userId: user.id, error: err });
    await markJob(job.id, { status: "failed" });
    return NextResponse.json({ done: false });
  }
}
