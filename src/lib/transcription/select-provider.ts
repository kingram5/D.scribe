import { AIError } from "@/lib/ai/contracts";
export interface RecordingCapabilities {
  bytes: number;
  diarization: boolean;
  wordTimings: boolean;
  nativeLiveTranscript: boolean;
}
/** Unknown/multiple speakers retain Deepgram. No client flag can enable a provider globally. */
export function selectTranscriptionProvider(
  actorId: string,
  uploadId: string,
  needs: RecordingCapabilities,
  env: Record<string, string | undefined> = process.env,
): "current" | "groq" | "native" {
  if (needs.nativeLiveTranscript) return "native";
  if (env.UPLOAD_TRANSCRIPTION_PROVIDER !== "groq") return "current";
  const allowed = (env.GROQ_TRANSCRIPTION_ACCOUNTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(actorId);
  const single = (env.GROQ_SINGLE_SPEAKER_UPLOAD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(uploadId);
  if (!allowed || !single || needs.diarization || needs.bytes > 25_000_000)
    return "current";
  if (!env.GROQ_API_KEY || !env.GROQ_CAPABILITY_VERIFICATION)
    throw new AIError(
      "configuration",
      "Verify Groq access, language/timestamps and recording capability before enabling it",
    );
  return "groq";
}
