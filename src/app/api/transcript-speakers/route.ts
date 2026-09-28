import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { allSpeakersLabeled, speakersIn, type SpeakerMap } from "@/lib/speakers";
import type { TranscriptSegment } from "@/types";

// POST /api/transcript-speakers
//   { transcript_id, speaker_map, reassign?: { index: number, speaker: string }[] }  save labels
//   { transcript_id, action: "unconfirm" }  ask again (after a full-text edit reshuffled paragraphs)
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "transcript-speakers", 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, {
      status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
    });
  }

  const body = await req.json();
  const db = createServerClient();
  const { data: tx } = await db.from("transcripts").select("id, project_id, full_text, segments, speaker_map").eq("id", body.transcript_id).single();
  if (!tx) return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  const { data: project } = await db.from("projects").select("id").eq("id", tx.project_id).eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Transcript not found" }, { status: 404 });

  if (body.action === "unconfirm") {
    await db.from("transcripts").update({ speakers_confirmed_at: null }).eq("id", tx.id);
    return NextResponse.json({ ok: true });
  }

  // Validate the map: known roles only, short strings, names required for others.
  const raw = (body.speaker_map ?? {}) as Record<string, { role?: string; name?: string; relationship?: string }>;
  const map: SpeakerMap = {};
  for (const [speaker, label] of Object.entries(raw)) {
    if (typeof speaker !== "string" || speaker.length > 40 || !label) continue;
    if (label.role === "author") map[speaker] = { role: "author" };
    else if (label.role === "other") {
      const name = String(label.name ?? "").trim().slice(0, 60);
      if (!name) return NextResponse.json({ error: `Give ${speaker} a name.` }, { status: 400 });
      const relationship = String(label.relationship ?? "").trim().slice(0, 60);
      map[speaker] = relationship ? { role: "other", name, relationship } : { role: "other", name };
    }
  }

  // Optional per-paragraph fixes: move specific segments to another speaker label.
  let segments = (tx.segments ?? []) as TranscriptSegment[];
  if (Array.isArray(body.reassign) && body.reassign.length) {
    segments = segments.map((s, i) => {
      const fix = body.reassign.find((r: { index: number; speaker: string }) => r.index === i);
      return fix && typeof fix.speaker === "string" && fix.speaker.length <= 40 ? { ...s, speaker: fix.speaker } : s;
    });
  }

  const labeled = { full_text: tx.full_text, segments, speaker_map: map };
  const complete = allSpeakersLabeled(labeled);
  // Drop labels for speakers who no longer appear (after merges and fixes).
  const present = new Set(speakersIn(segments));
  for (const k of Object.keys(map)) if (!present.has(k)) delete map[k];

  const { error: upErr } = await db.from("transcripts").update({
    speaker_map: map,
    segments,
    speakers_confirmed_at: complete ? new Date().toISOString() : null,
  }).eq("id", tx.id);
  if (upErr) return NextResponse.json({ error: "Could not save speakers." }, { status: 500 });
  return NextResponse.json({ ok: true, complete, speaker_map: map });
}
