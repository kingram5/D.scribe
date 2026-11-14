import { createServerClient } from "@/lib/supabase";
/** Page through persisted source fragments; Supabase's default row cap must not truncate an answer. */
export async function readLiveTranscripts(sessionId: string) {
  const db = createServerClient();
  const rows: { event_id: string; event_type: string; payload: unknown }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from("theo_live_events")
      .select("event_id,event_type,payload")
      .eq("session_id", sessionId)
      .in("event_type", [
        "session.input_transcript.delta",
        "session.output_transcript.delta",
      ])
      .order("created_at")
      .order("event_id")
      .range(offset, offset + 499);
    if (error) throw new Error("Saved voice transcript is unavailable");
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}
