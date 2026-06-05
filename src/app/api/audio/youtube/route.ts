import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkInk } from "@/lib/ink";

export const maxDuration = 300;

const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY || "";
const SUPADATA_BASE = "https://api.supadata.ai/v1";

interface SupadataSegment {
  text: string;
  offset: number;
  duration: number;
  lang: string;
}

async function fetchTranscript(url: string): Promise<SupadataSegment[]> {
  const headers = { "x-api-key": SUPADATA_API_KEY };

  const res = await fetch(
    `${SUPADATA_BASE}/youtube/transcript?url=${encodeURIComponent(url)}`,
    { headers }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supadata error: ${err}`);
  }

  const data = await res.json();

  // Short video — transcript returned directly
  if (data.content) {
    return data.content;
  }

  // Long video — poll for job completion
  if (data.jobId) {
    return pollJob(data.jobId, headers);
  }

  throw new Error("Unexpected Supadata response");
}

async function pollJob(
  jobId: string,
  headers: Record<string, string>
): Promise<SupadataSegment[]> {
  const deadline = Date.now() + 270_000; // 4.5 min max

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));

    const res = await fetch(`${SUPADATA_BASE}/job/${jobId}`, { headers });
    if (!res.ok) continue;

    const data = await res.json();
    if (data.status === "completed" && data.result?.content) {
      return data.result.content;
    }
    if (data.status === "failed") {
      throw new Error("Supadata transcription job failed");
    }
  }

  throw new Error("Transcription timed out — video may be too long");
}

// POST /api/audio/youtube — get transcript via Supadata, no audio download needed
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "youtube");
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const inkCheck = await checkInk(user.id);
  if (!inkCheck.allowed) {
    return NextResponse.json({ error: "out_of_ink", message: inkCheck.reason }, { status: 402 });
  }

  const { youtube_url, project_id } = await req.json();

  if (!youtube_url || !project_id) {
    return NextResponse.json(
      { error: "youtube_url and project_id are required" },
      { status: 400 }
    );
  }

  if (!SUPADATA_API_KEY) {
    return NextResponse.json(
      { error: "Supadata API key not configured" },
      { status: 500 }
    );
  }

  const supabase = createServerClient();

  // Verify the project belongs to this user
  const { data: projectOwner } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!projectOwner) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Create stub audio_upload record (no actual file — transcript comes from Supadata)
  const { data: upload, error: uploadError } = await supabase
    .from("audio_uploads")
    .insert({
      project_id,
      file_path: "",
      file_name: youtube_url,
      file_size_bytes: 0,
      status: "transcribing",
    })
    .select()
    .single();

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  try {
    const segments = await fetchTranscript(youtube_url);

    const fullText = segments.map((s) => s.text).join(" ");
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;

    // Map Supadata segments to our TranscriptSegment shape
    const mappedSegments = segments.map((s) => ({
      start: s.offset / 1000,
      end: (s.offset + s.duration) / 1000,
      text: s.text,
      speaker: "Speaker 1",
    }));

    const { data: transcript, error: txError } = await supabase
      .from("transcripts")
      .insert({
        audio_upload_id: upload.id,
        project_id,
        full_text: fullText,
        segments: mappedSegments,
        word_count: wordCount,
        speaker_count: 1,
      })
      .select()
      .single();

    if (txError) throw txError;

    await supabase
      .from("audio_uploads")
      .update({ status: "transcribed" })
      .eq("id", upload.id);

    return NextResponse.json(
      { id: upload.id, transcribed: true, transcript_id: transcript.id },
      { status: 201 }
    );
  } catch (err) {
    await supabase
      .from("audio_uploads")
      .update({ status: "failed" })
      .eq("id", upload.id);

    const message = err instanceof Error ? err.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
