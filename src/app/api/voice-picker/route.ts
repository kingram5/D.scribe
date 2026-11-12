import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { checkInk } from "@/lib/ink";
import { pickerState, savePick } from "@/lib/voice-dials-store";
import { guard, errorResponse } from "../publisher-ready/_shared";

export const maxDuration = 60;

// GET /api/voice-picker?project_id=…  → { done, answered, pairs }
export async function GET(req: NextRequest) {
  const { user, error } = await guard(await requireAuth(), "voice-picker-read", 60);
  if (error) return error;
  try {
    const projectId = req.nextUrl.searchParams.get("project_id") ?? "";
    const { data: project } = await createServerClient().from("projects").select("id").eq("id", projectId).eq("user_id", user.id).single();
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const ink = await checkInk(user.id, "style_distill");
    if (!ink.allowed) return NextResponse.json({ done: false, answered: 0, pairs: [] });
    return NextResponse.json(await pickerState(user.id, projectId));
  } catch (err) {
    return errorResponse(err, "/api/voice-picker", user.id);
  }
}

// POST /api/voice-picker { pair_id, choice: "a" | "b" | "neither", rewrite? }
export async function POST(req: NextRequest) {
  const { user, error } = await guard(await requireAuth(), "voice-picker", 60);
  if (error) return error;
  try {
    const body = await req.json();
    if (!body.pair_id || !["a", "b", "neither"].includes(body.choice)) {
      return NextResponse.json({ error: "pair_id and choice (a|b|neither) required" }, { status: 400 });
    }
    return NextResponse.json(await savePick(user.id, body.pair_id, body.choice, body.rewrite));
  } catch (err) {
    return errorResponse(err, "/api/voice-picker", user.id);
  }
}
