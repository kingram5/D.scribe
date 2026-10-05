import { createServerClient } from "@/lib/supabase";
import { analysisGuidanceBlock, selectAnalysisMoments, type MomentResponse } from "./analysis-moments";
import type { Transcript } from "@/types";

export async function loadAnalysisGuidance(projectId: string): Promise<string> {
  const db = createServerClient();
  const [answers, transcripts] = await Promise.all([
    db.from("analysis_moments").select("*").eq("project_id", projectId).order("updated_at"),
    db.from("transcripts").select("*").eq("project_id", projectId).order("created_at"),
  ]);
  // Old deployments/projects retain their original behavior until the additive migration is applied.
  if (answers.error?.code === "42P01" || answers.error?.code === "PGRST205") return "";
  if (answers.error || transcripts.error) throw new Error("Couldn't load your analysis choices. Please try again.");
  const current = new Map(selectAnalysisMoments((transcripts.data || []) as Transcript[]).map(m => [m.id, m]));
  return analysisGuidanceBlock((answers.data || []).flatMap(row => {
    const moment = current.get(row.card_id);
    return moment ? [{ ...moment, importance: row.importance, context: row.context, clarification_answer: row.clarification_answer } as MomentResponse] : [];
  }));
}
