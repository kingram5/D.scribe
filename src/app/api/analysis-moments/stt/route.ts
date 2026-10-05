import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkInk, recordFlatInkUsage, inkPerAudioMinute } from "@/lib/ink";
import { transcribeUtterance } from "@/lib/deepgram";

export const maxDuration = 60;
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { allowed } = await checkRateLimit(user.id, "analysis-moments-stt", 20);
  if (!allowed) return NextResponse.json({ error: "Please wait before recording again." }, { status: 429 });
  const projectId = req.nextUrl.searchParams.get("project_id");
  const { data: project } = await createServerClient().from("projects").select("id").eq("id", projectId ?? "").eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const type = (req.headers.get("content-type") || "").split(";")[0];
  if (!type.startsWith("audio/")) return NextResponse.json({ error: "Send recorded audio." }, { status: 400 });
  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES) return NextResponse.json({ error: "Recording too large." }, { status: 413 });
  const ink = await checkInk(user.id, "transcribe");
  if (!ink.allowed) return NextResponse.json({ error: "Not enough Ink to transcribe. You can type instead." }, { status: 402 });
  const audio = Buffer.from(await req.arrayBuffer());
  if (!audio.length || audio.length > MAX_BYTES) return NextResponse.json({ error: "Record a short audio answer." }, { status: 400 });
  try {
    const transcript = await transcribeUtterance(audio, type);
    const seconds = Number(req.nextUrl.searchParams.get("seconds"));
    const minutes = Math.min(3, Math.max(0.25, (Number.isFinite(seconds) ? seconds : 0) / 60));
    await recordFlatInkUsage(user.id, project.id, "transcribe", "deepgram", minutes * inkPerAudioMinute());
    return NextResponse.json({ transcript });
  } catch {
    return NextResponse.json({ error: "Couldn't transcribe that. Your typed answer is still here." }, { status: 502 });
  }
}
