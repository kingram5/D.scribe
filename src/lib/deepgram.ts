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
    }
  );

  // Cast to sync response type (we don't use callback URLs)
  const result = response as { metadata?: { duration?: number }; results?: { utterances?: Array<{ start?: number; end?: number; transcript?: string; speaker?: number }> } };
  const utterances = result?.results?.utterances ?? [];
  const segments: TranscriptSegment[] = utterances.map((u) => ({
    start: u.start ?? 0,
    end: u.end ?? 0,
    text: u.transcript ?? "",
    speaker: `Speaker ${u.speaker ?? 0}`,
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
