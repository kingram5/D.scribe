import type { TranscriptionResult } from "@/lib/deepgram";
import { AIError } from "@/lib/ai/contracts";
export interface GroqChunk {
  offsetSeconds: number;
  text: string;
  duration: number;
  segments: { start: number; end: number; text: string }[];
  words?: { start: number; end: number; word: string }[];
}
/** Only exact overlapping timed segments are duplicates; repeated speech at another time survives. */
export function normalizeGroqChunks(chunks: GroqChunk[]): TranscriptionResult {
  const seen = new Set<string>();
  const segments: TranscriptionResult["segments"] = [];
  for (const chunk of chunks
    .slice()
    .sort((a, b) => a.offsetSeconds - b.offsetSeconds)) {
    if (
      !Number.isFinite(chunk.offsetSeconds) ||
      chunk.offsetSeconds < 0 ||
      !Number.isFinite(chunk.duration) ||
      chunk.duration < 0
    )
      throw new AIError("malformed", "Invalid audio timing");
    // Validate before assigning words to segments; filtering must not hide bad usage data.
    if (
      (chunk.words ?? []).some(
        (w) =>
          !w ||
          typeof w.word !== "string" ||
          !Number.isFinite(w.start) ||
          !Number.isFinite(w.end) ||
          w.start < 0 ||
          w.end < w.start ||
          w.end > chunk.duration + 1,
      )
    )
      throw new AIError("malformed", "Invalid word timing");
    for (const segment of chunk.segments) {
      if (
        typeof segment.text !== "string" ||
        !Number.isFinite(segment.start) ||
        !Number.isFinite(segment.end) ||
        segment.start < 0 ||
        segment.end < segment.start ||
        segment.end > chunk.duration + 1
      )
        throw new AIError("malformed", "Invalid transcript segment");
      const start = segment.start + chunk.offsetSeconds,
        end = segment.end + chunk.offsetSeconds;
      const key = JSON.stringify([start, end, segment.text]);
      if (seen.has(key)) continue;
      seen.add(key);
      const words = (chunk.words ?? [])
        .filter((w) => w.start >= segment.start && w.end <= segment.end)
        .map((w) => ({
          w: w.word,
          s: w.start + chunk.offsetSeconds,
          e: w.end + chunk.offsetSeconds,
        }));
      if (
        words.some(
          (w) =>
            typeof w.w !== "string" ||
            !Number.isFinite(w.s) ||
            !Number.isFinite(w.e) ||
            w.e < w.s,
        )
      )
        throw new AIError("malformed", "Invalid word timing");
      segments.push({
        start,
        end,
        text: segment.text,
        speaker: "Speaker 0",
        words,
      });
    }
  }
  const text = segments.map((s) => s.text).join("\n\n");
  if (!text.trim())
    throw new AIError("malformed", "Transcription returned no timed text");
  return {
    full_text: text,
    segments,
    word_count: text.trim().split(/\s+/).length,
    speaker_count: 1,
    duration_seconds: Math.ceil(
      Math.max(...chunks.map((c) => c.offsetSeconds + c.duration)),
    ),
  };
}
/** Groq bills each transcription request for at least ten seconds. */
export function groqVendorCost(duration: number, usdPerHour: number): number {
  if (
    !Number.isFinite(duration) ||
    duration < 0 ||
    !Number.isFinite(usdPerHour) ||
    usdPerHour < 0
  )
    throw new AIError("reconcile", "Invalid transcription usage or price");
  return (Math.max(10, duration) / 3600) * usdPerHour;
}
export async function transcribeGroq(
  audio: Buffer,
  mime: string,
  language?: string,
  transport: typeof fetch = fetch,
): Promise<{
  transcript: TranscriptionResult;
  requestId: string | null;
  rawUsage: { duration: number; model: string };
}> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new AIError("configuration", "GROQ_API_KEY is missing");
  if (audio.length > 25_000_000)
    throw new AIError(
      "configuration",
      "Groq eligible uploads must be at most 25 MB; larger recordings stay on the legacy route",
    );
  const model =
    process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo";
  const form = new FormData();
  form.set(
    "file",
    new Blob([new Uint8Array(audio)], { type: mime }),
    mime === "audio/wav"
      ? "recording.wav"
      : mime === "audio/mpeg"
        ? "recording.mp3"
        : "recording.m4a",
  );
  form.set("model", model);
  form.set("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  if (language) form.set("language", language); // No translation endpoint; absent language means auto-detect.
  const response = await transport(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(120000),
    },
  );
  if (!response.ok)
    throw new AIError(
      response.status >= 500 ? "reconcile" : "configuration",
      `Groq HTTP ${response.status}`,
    );
  const raw = await response.json();
  if (
    typeof raw.text !== "string" ||
    !Array.isArray(raw.segments) ||
    !Array.isArray(raw.words)
  )
    throw new AIError(
      "malformed",
      "Groq did not return required transcript capabilities",
    );
  return {
    transcript: normalizeGroqChunks([{ ...raw, offsetSeconds: 0 }]),
    requestId: response.headers.get("x-request-id"),
    rawUsage: { duration: raw.duration, model },
  };
}
