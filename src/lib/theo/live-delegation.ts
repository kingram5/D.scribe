import { mixedAuxiliary } from "@/lib/ai/auxiliary";
import { createServerClient } from "@/lib/supabase";
/** Authoritative history comes from persisted vendor events, never a browser-supplied utterance. */
export async function delegateLive(
  session: { id: string; user_id: string; run_id: string; question_id: string },
  delegationId: string,
): Promise<string> {
  const db = createServerClient();
  const [{ data: events, error }, { data: question, error: qe }] =
    await Promise.all([
      db
        .from("theo_live_events")
        .select("role,text")
        .eq("session_id", session.id)
        .order("received_at")
        .limit(300),
      db
        .from("pr_questions")
        .select("question")
        .eq("id", session.question_id)
        .eq("run_id", session.run_id)
        .single(),
    ]);
  if (error || qe) throw error ?? qe;
  const result = await mixedAuxiliary({
    actorId: session.user_id,
    runId: session.run_id,
    liveSessionId: session.id,
    key: `live:${session.id}:${delegationId}`,
    workload: "interview",
    system:
      "Coach Theo using the persisted editorial question and conversation. Return one short, specific follow-up question, under 25 words, or DONE when answered. Never invent an answer. Retain the author's corrections and distinguish author from Theo.",
    user: JSON.stringify({
      question: question?.question,
      conversation: events,
    }),
    maxTokens: 1000,
  });
  if (!result) throw new Error("Live delegation requires a pinned mixed run");
  return result.text.slice(0, 1600);
}
