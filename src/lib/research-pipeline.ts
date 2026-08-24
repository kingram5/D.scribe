import { askClaudeLite, cleanJson } from "@/lib/claude-lite";
import {
  filterGroundedItems,
  idsToEvict,
  normalizeResearchText,
  parseAssessPlan,
  parseExtractedItems,
  RESEARCH_CORPUS_CAP,
  RESEARCH_INK_COST,
  shouldInsertNormalized,
  type ResearchItem,
} from "@/lib/research-corpus";
import { dedupePagesByUrl, searchPages, type FetchedPage } from "@/lib/research-search";
import { createServerClient } from "@/lib/supabase";
import { recordFlatInkUsage } from "@/lib/ink";
import { logger } from "@/lib/logger";

const ASSESS_SYSTEM = `You assess whether a book brainstorm has a specific enough topic to research live sources.

Confidence rubric:
- high: a SPECIFIC book topic and angle, not just a genre. Example of high: "tithing as a spiritual discipline for young families".
- low: vague genre or circling. Example of low: "something about faith and money".
When in doubt, return low.

Return ONLY JSON: {"confidence":"high"|"low","topic_summary":"...","themes":["..."],"queries":["..."]}
queries: 3-5 targeted web searches mixing supporting statistics, expert quotes, notable research, and counterpoints.`;

const EXTRACT_SYSTEM = `You are an extractor, not an author.

THE GROUNDING RULE is non-negotiable: every "text" value MUST be copied verbatim from the provided page content. "attribution" may only name who the PAGE says said it. Anything the pages do not literally contain must be discarded.

Return ONLY a JSON array of up to 12 items:
{"kind":"quote"|"stat"|"reference","text":"...","attribution":"...or null","source_title":"...","source_url":"...","source_date":"...or null","themes":["..."]}`;

export async function assessTopic(
  digest: Array<{ role: string; content: string }>,
  title: string,
  audience: string,
): Promise<{ confidence: "high" | "low"; topic_summary: string; themes: string[]; queries: string[] }> {
  const raw = await askClaudeLite(
    ASSESS_SYSTEM,
    `Project title: ${title || "(untitled)"}\nAudience: ${audience || "General"}\n\nRecent conversation:\n${digest.map((m) => `${m.role}: ${m.content}`).join("\n")}`,
    { model: "fast", maxTokens: 800, temperature: 0.2 },
  );
  const parsed = parseAssessPlan(JSON.parse(cleanJson(raw)));
  if (!parsed) {
    return { confidence: "low", topic_summary: "", themes: [], queries: [] };
  }
  return parsed;
}

export async function gatherPages(queries: string[]): Promise<FetchedPage[]> {
  const batches = await Promise.all(queries.slice(0, 5).map((q) => searchPages(q)));
  return dedupePagesByUrl(batches.flat());
}

export async function extractResearchItems(pages: FetchedPage[]): Promise<ResearchItem[]> {
  if (pages.length === 0) return [];
  const payload = pages.map((p) => ({
    title: p.title,
    url: p.url,
    date: p.published,
    content: p.content.slice(0, 12_000),
  }));
  const raw = await askClaudeLite(
    EXTRACT_SYSTEM,
    `Extract verbatim quotes, stats, and references from these fetched pages:\n${JSON.stringify(payload)}`,
    { model: "fast", maxTokens: 2500, temperature: 0.1 },
  );
  const extracted = parseExtractedItems(JSON.parse(cleanJson(raw)));
  return filterGroundedItems(extracted, pages.map((p) => `${p.title}\n${p.content}`));
}

export async function persistResearchItems(input: {
  projectId: string;
  userId: string;
  items: ResearchItem[];
}): Promise<number> {
  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from("research_items")
    .select("id, text, created_at")
    .eq("project_id", input.projectId)
    .eq("user_id", input.userId)
    .eq("status", "active");

  const existingNormalized = new Set((existing ?? []).map((row) => normalizeResearchText(row.text)));
  const fresh = input.items.filter((item) => shouldInsertNormalized(item.text, existingNormalized));
  for (const item of fresh) existingNormalized.add(normalizeResearchText(item.text));

  if (fresh.length > 0) {
    const { error } = await supabase.from("research_items").insert(
      fresh.map((item) => ({
        project_id: input.projectId,
        user_id: input.userId,
        kind: item.kind,
        text: item.text,
        attribution: item.attribution,
        source_title: item.source_title,
        source_url: item.source_url,
        source_date: item.source_date,
        themes: item.themes,
        status: "active",
      })),
    );
    if (error) throw new Error(error.message);
  }

  const { data: after } = await supabase
    .from("research_items")
    .select("id, created_at")
    .eq("project_id", input.projectId)
    .eq("user_id", input.userId)
    .eq("status", "active");

  const evict = idsToEvict(after ?? [], RESEARCH_CORPUS_CAP);
  if (evict.length > 0) {
    await supabase
      .from("research_items")
      .update({ status: "dismissed" })
      .eq("user_id", input.userId)
      .in("id", evict);
  }

  return fresh.length;
}

export async function chargeResearchInk(userId: string, projectId: string): Promise<void> {
  await recordFlatInkUsage(userId, projectId, "research", "tavily", RESEARCH_INK_COST);
}

export async function markJob(
  jobId: string,
  patch: {
    status: "done" | "failed" | "skipped";
    topic_summary?: string | null;
    queries?: unknown;
    items_added?: number;
  },
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("research_jobs")
    .update({
      ...patch,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) {
    logger.error("research job update failed", { route: "/api/research/run", error });
  }
}
