import { TranscriptSegment } from "@/types";

let dgClient: { listen: { v1: { media: { transcribeFile: (
  input: { data: Uint8Array; contentType: string },
  options: Record<string, unknown>
) => Promise<unknown> } } } } | null = null;

async function getClient() {
  if (!dgClient) {
    const { DeepgramClient } = await import("@deepgram/sdk");
    dgClient = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY! });
  }
  return dgClient;
}

export interface TranscriptionResult {
  full_text: string;
  segments: TranscriptSegment[];
  word_count: number;
  speaker_count: number;
  duration_seconds: number;
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string
): Promise<TranscriptionResult> {
  const dg = await getClient();

  const response = await dg.listen.v1.media.transcribeFile(
    { data: new Uint8Array(audioBuffer), contentType: mimeType },
    {
      model: "nova-3",
      smart_format: true,
      diarize: true,
      paragraphs: true,
      utterances: true,
      punctuate: true,
      // Opt out of Deepgram's Model Improvement Program so submitted audio isn't
      // retained for training — required before we can claim "we don't retain your audio".
      mip_opt_out: true,
    }
  );

  // Cast to sync response type (we don't use callback URLs)
  const result = response as {
    metadata?: { duration?: number };
    results?: {
      utterances?: Array<{
        start?: number;
        end?: number;
        transcript?: string;
        speaker?: number;
        words?: Array<{ word?: string; punctuated_word?: string; start?: number; end?: number }>;
      }>;
    };
  };
  const utterances = result?.results?.utterances ?? [];
  const segments: TranscriptSegment[] = utterances.map((u) => ({
    start: u.start ?? 0,
    end: u.end ?? 0,
    text: u.transcript ?? "",
    speaker: `Speaker ${u.speaker ?? 0}`,
    // Word-level timings feed the prosody engine (within-utterance emphasis).
    // Compact keys keep the jsonb column lean at scale.
    words: (u.words ?? []).map((w) => ({
      w: w.punctuated_word ?? w.word ?? "",
      s: w.start ?? 0,
      e: w.end ?? 0,
    })),
  }));

  const full_text = segments.map((s) => s.text).join("\n\n");
  const word_count = full_text.split(/\s+/).length;

  const speakers = new Set(segments.map((s) => s.speaker));
  const duration_seconds = Math.ceil(
    result?.metadata?.duration ??
      (utterances.length > 0
        ? (utterances[utterances.length - 1]?.end ?? 0)
        : 0)
  );

  return {
    full_text,
    segments,
    word_count,
    speaker_count: speakers.size,
    duration_seconds,
  };
}

/** Short-utterance transcript for the studio hands-free path. No diarize. */
export function transcriptFromDeepgramResponse(response: unknown): string {
  const result = response as {
    results?: {
      channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
      utterances?: Array<{ transcript?: string }>;
    };
  };
  const channelText = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
  if (channelText) return channelText;
  const utterances = result?.results?.utterances ?? [];
  return utterances.map((u) => u.transcript?.trim() ?? "").filter(Boolean).join(" ").trim();
}

export async function transcribeUtterance(
  audioBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const dg = await getClient();
  const response = await dg.listen.v1.media.transcribeFile(
    { data: new Uint8Array(audioBuffer), contentType: mimeType },
    {
      model: "nova-3",
      smart_format: true,
      punctuate: true,
      mip_opt_out: true,
    }
  );
  return transcriptFromDeepgramResponse(response);
}
