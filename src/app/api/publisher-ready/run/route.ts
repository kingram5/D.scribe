import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureBalance } from "@/lib/ink";
import { estimateRunInk } from "@/lib/publisher-ready/estimate";
import { STEP_MODELS } from "@/lib/publisher-ready/pipeline";
import { progress, type RRQuestion } from "@/lib/publisher-ready/round-robin";
import { requireAuth } from "@/lib/auth";
import { guard, errorResponse } from "../_shared";

// GET /api/publisher-ready/run?project_id=… — the live run (or last finished) with per-chapter state.
export async function GET(req: NextRequest) {
  const { user, error } = await guard(await requireAuth(), "run-read", 120);
  if (error) return error;
  try {
    const projectId = req.nextUrl.searchParams.get("project_id");
    if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });
    const db = createServerClient();
    const { data: project } = await db.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).single();
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const { data: chapters } = await db.from("chapters").select("id, chapter_number, title, target_word_count, status")
      .eq("project_id", projectId).gt("chapter_number", 0).order("chapter_number");
    const estimate = estimateRunInk(chapters || []);
    const estimateSkipDraft = estimateRunInk(chapters || [], { skipDraft: true });
    const { data: run } = await db.from("pr_runs").select("*").eq("project_id", projectId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const estimateDraft = estimateRunInk(chapters || [], { draftOnly: true });
    if (!run) return NextResponse.json({ run: null, chapters: chapters || [], estimate, estimateSkipDraft, estimateDraft });

    const [passes, questions] = await Promise.all([
      db.from("pr_chapter_passes").select("chapter_id, step, scores, version_out, change_log").eq("run_id", run.id),
      db.from("pr_questions").select("id, chapter_id, impact, status, asked_round, created_at").eq("run_id", run.id),
    ]);
    return NextResponse.json({
      run,
      chapters: chapters || [],
      estimate,
      estimateSkipDraft,
      estimateDraft,
      passes: passes.data || [],
      interview: progress((questions.data || []) as RRQuestion[]),
    });
  } catch (err) {
    return errorResponse(err, "/api/publisher-ready/run", user.id);
  }
}

// POST /api/publisher-ready/run { project_id, action?: "start" | "complete" | "cancel", run_id?, skip_draft?, draft_only? }
export async function POST(req: NextRequest) {
  const { user, error } = await guard(await requireAuth(), "run", 20);
  if (error) return error;
  try {
    const body = await req.json();
    const db = createServerClient();
    const action = body.action ?? "start";

    if (action === "complete" || action === "cancel") {
      const { data: run } = await db.from("pr_runs").select("id").eq("id", body.run_id).eq("user_id", user.id).single();
      if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
      await db.from("pr_runs").update({
        status: action === "complete" ? "done" : "cancelled",
        finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", run.id);
      return NextResponse.json({ ok: true });
    }

    const projectId = body.project_id;
    const { data: project } = await db.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).single();
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const { data: live } = await db.from("pr_runs").select("*").eq("project_id", projectId)
      .not("status", "in", "(done,cancelled)").maybeSingle();
    const { data: chapters } = await db.from("chapters").select("id, target_word_count")
      .eq("project_id", projectId).gt("chapter_number", 0);

    if (live) {
      // Flow v2: First Draft opens the run on the draft's Ink alone. Starting the
      // review on that run must still check everything after the draft up front,
      // so nobody pays for an editor read and then runs dry mid-revise.
      if (body.skip_draft === true && chapters?.length) {
        const rest = estimateRunInk(chapters, { skipDraft: true });
        const balance = await ensureBalance(user.id);
        const spendable = Number(balance.ink_balance) + Number(balance.topup_ink ?? 0);
        if (spendable < rest) {
          return NextResponse.json({
            error: "out_of_ink",
            message: `The review, interview and rewrite need about ${rest} Ink and you have ${Math.floor(spendable)}.`,
            estimate: rest,
          }, { status: 402 });
        }
        if (Number(live.ink_estimate ?? 0) < rest) {
          await db.from("pr_runs").update({ ink_estimate: rest, updated_at: new Date().toISOString() }).eq("id", live.id);
          live.ink_estimate = rest;
        }
      }
      return NextResponse.json({ run: live, resumed: true });
    }
    if (!chapters || chapters.length === 0) {
      return NextResponse.json({ error: "Build an outline first: Publisher-Ready works chapter by chapter." }, { status: 400 });
    }

    // Check the whole run up front: never let a user pay for a draft and an
    // editor read and then run dry before the revise.
    // Keeping the current chapters as the first draft drops the draft cost.
    // Starting from the First Draft page checks only the draft's Ink: the review is optional.
    const estimate = estimateRunInk(chapters, body.draft_only === true ? { draftOnly: true } : { skipDraft: body.skip_draft === true });
    const balance = await ensureBalance(user.id);
    const spendable = Number(balance.ink_balance) + Number(balance.topup_ink ?? 0);
    if (spendable < estimate) {
      return NextResponse.json({
        error: "out_of_ink",
        message: `This book needs about ${estimate} Ink ${body.draft_only === true ? "for the first draft" : "for a Publisher-Ready pass"} and you have ${Math.floor(spendable)}.`,
        estimate,
      }, { status: 402 });
    }

    const { data: run, error: insErr } = await db.from("pr_runs").insert({
      project_id: projectId, user_id: user.id, status: "drafting", ink_estimate: estimate, models: STEP_MODELS,
    }).select().single();
    if (insErr) throw insErr;
    return NextResponse.json({ run, estimate }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "/api/publisher-ready/run", user.id);
  }
}
