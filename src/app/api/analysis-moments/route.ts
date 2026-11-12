import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { selectAnalysisMoments } from "@/lib/analysis-moments";
import type { Transcript } from "@/types";

async function ownedMoments(projectId: string, userId: string) {
  const db = createServerClient();
  const { data: project } = await db.from("projects").select("id").eq("id", projectId).eq("user_id", userId).single();
  if (!project) return null;
  const { data, error } = await db.from("transcripts").select("*").eq("project_id", projectId).order("created_at");
  if (error) throw new Error("Couldn't load the transcript.");
  return { db, cards: selectAnalysisMoments((data || []) as Transcript[]) };
}

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "Project required" }, { status: 400 });
  try {
    const owned = await ownedMoments(projectId, user.id);
    if (!owned) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const result = await owned.db.from("analysis_moments").select("card_id, importance, context, clarification_answer").eq("project_id", projectId).eq("user_id", user.id);
    if (result.error) return NextResponse.json({ error: "Moment choices aren't available yet." }, { status: 503 });
    return NextResponse.json({ cards: owned.cards, responses: result.data || [] });
  } catch {
    return NextResponse.json({ error: "Couldn't load your moments." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { allowed } = await checkRateLimit(user.id, "analysis-moments", 60);
  if (!allowed) return NextResponse.json({ error: "Please wait a moment and try again." }, { status: 429 });
  try {
    const body = await req.json();
    if (typeof body.project_id !== "string" || typeof body.card_id !== "string" || !["essential", "supporting", "exclude"].includes(body.importance)
      || typeof body.context !== "string" || body.context.length > 6000 || typeof body.clarification_answer !== "string" || body.clarification_answer.length > 3000) {
      return NextResponse.json({ error: "Invalid moment response" }, { status: 400 });
    }
    const owned = await ownedMoments(body.project_id, user.id);
    if (!owned) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const card = owned.cards.find(c => c.id === body.card_id);
    if (!card) return NextResponse.json({ error: "This passage changed. Reload the moments before saving." }, { status: 409 });
    const result = await owned.db.from("analysis_moments").upsert({
      project_id: body.project_id, user_id: user.id, card_id: card.id, transcript_id: card.transcript_id,
      excerpt: card.excerpt, speaker: card.speaker, importance: body.importance,
      context: body.context.trim(), clarification_answer: body.clarification_answer.trim(), updated_at: new Date().toISOString(),
    }, { onConflict: "project_id,card_id" });
    if (result.error) return NextResponse.json({ error: "Couldn't save this choice. Please retry." }, { status: 500 });
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "Couldn't save this choice. Please retry." }, { status: 500 });
  }
}
