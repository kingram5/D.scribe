import type {
  InputTranscriptDeltaEvent,
  OutputTranscriptDeltaEvent,
} from "openai/resources/live/live";
export type TranscriptEvent =
  | InputTranscriptDeltaEvent
  | OutputTranscriptDeltaEvent;
/** Events are append-only SDK transcript fragments. Deduplicate before ordered assembly. */
export function transcriptText(
  events: TranscriptEvent[],
  afterMs = -1,
  throughMs = Infinity,
): string {
  const seen = new Set<string>();
  return events
    .filter((e) => {
      if (seen.has(e.event_id) || e.end_ms <= afterMs || e.end_ms > throughMs)
        return false;
      seen.add(e.event_id);
      return true;
    })
    .sort((a, b) => a.start_ms - b.start_ms)
    .map((e) => e.delta)
    .join("");
}
export function safeVendorLifetime(
  expiresAt: number,
  requestStartedAt: number,
  reserved: number,
): boolean {
  const lifetime = expiresAt - Math.floor(requestStartedAt / 1000);
  return Number.isFinite(lifetime) && lifetime > 0 && lifetime + 5 <= reserved;
}
