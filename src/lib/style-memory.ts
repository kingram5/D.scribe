import { createServerClient } from "@/lib/supabase";
import { askClaudeWithUsage, cleanJsonLite } from "@/lib/claude-lite";
import { recordInkUsage } from "@/lib/ink";
import { logger } from "@/lib/logger";

/**
 * Editorial Memory — distills the user's edits into a persistent style memory
 * that future generations apply proactively. The loop:
 *
 *   manual save → style_deltas (sentence diffs)        \
 *   Magic Edit / Rewrite bar → edit_events (intent)     > distill (Haiku)
 *                                                       /
 *   → user_style_memory.memory → injected into generateSystem()
 *
 * Chapter 10 should need fewer edits than chapter 1 — and that improvement
 * lives in our database, not in a prompt anyone can copy.
 */

export interface StyleMemory {
  /** Things this author consistently removes or rewrites away */
  avoid: string[];
  /** Patterns this author consistently introduces */
  prefer: string[];
  /** Direct word/phrase substitutions observed repeatedly */
  phrase_swaps: { from: string; to: string }[];
  /** Free-form observations that don't fit the above */
  notes: string[];
}

export const DISTILL_THRESHOLD = 5; // edits between distillation passes
const RECENT_LIMIT = 40;
const MEMORY_LIST_CAP = 12;

const DISTILL_SYSTEM = `You are a ghostwriting editor's apprentice. You study how an author edits AI-generated drafts of their own book and extract durable, reusable style rules from their edits. Focus on patterns that repeat across edits — one-off content fixes are not style rules. Be specific and actionable; each rule must be something a writer could apply while drafting the next chapter.`;

function distillPrompt(
  existing: StyleMemory | null,
  deltas: unknown[],
  events: unknown[]
): string {
  let prompt = `Analyze this author's recent edits to AI-generated chapters and produce an updated style memory.

RECENT SENTENCE-LEVEL DIFFS (original → their edit):
${JSON.stringify(deltas, null, 1)}

RECENT EXPLICIT EDIT INSTRUCTIONS (their own words + before/after):
${JSON.stringify(events, null, 1)}`;

  if (existing && (existing.avoid?.length || existing.prefer?.length)) {
    prompt += `\n\nCURRENT STYLE MEMORY (update it — keep rules still supported by evidence, drop stale ones, merge duplicates):
${JSON.stringify(existing, null, 1)}`;
  }

  prompt += `\n\nReturn ONLY valid JSON:
{
  "avoid": string[],        // max ${MEMORY_LIST_CAP}, most important first
  "prefer": string[],       // max ${MEMORY_LIST_CAP}
  "phrase_swaps": [{"from": string, "to": string}],  // max ${MEMORY_LIST_CAP}, only swaps seen 2+ times
  "notes": string[]         // max 5
}
No markdown fencing.`;
  return prompt;
}

function sanitizeMemory(raw: unknown): StyleMemory {
  const m = (raw ?? {}) as Partial<StyleMemory>;
  const strList = (v: unknown, cap: number): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, cap) : [];
  return {
    avoid: strList(m.avoid, MEMORY_LIST_CAP),
    prefer: strList(m.prefer, MEMORY_LIST_CAP),
    phrase_swaps: Array.isArray(m.phrase_swaps)
      ? m.phrase_swaps
          .filter(
            (s): s is { from: string; to: string } =>
              !!s && typeof s.from === "string" && typeof s.to === "string"
          )
          .slice(0, MEMORY_LIST_CAP)
      : [],
    notes: strList(m.notes, 5),
  };
}

export function isEmptyMemory(memory: StyleMemory | null | undefined): boolean {
  if (!memory) return true;
  return (
    (memory.avoid?.length ?? 0) === 0 &&
    (memory.prefer?.length ?? 0) === 0 &&
    (memory.phrase_swaps?.length ?? 0) === 0 &&
    (memory.notes?.length ?? 0) === 0
  );
}

/**
 * System-prompt block carrying the author's learned editing patterns.
 * Empty string when there's no memory yet — never pad the prompt.
 */
export function styleMemoryPromptBlock(memory: StyleMemory | null | undefined): string {
  if (isEmptyMemory(memory)) return "";
  const m = memory as StyleMemory;
  let block = `\n\nAUTHOR'S EDITING PATTERNS (learned from how they edit drafts — apply these proactively so they don't have to fix the same things again):`;
  if (m.avoid.length) block += `\nThey consistently remove or rewrite:\n${m.avoid.map((r) => `- ${r}`).join("\n")}`;
  if (m.prefer.length) block += `\nThey consistently move the text toward:\n${m.prefer.map((r) => `- ${r}`).join("\n")}`;
  if (m.phrase_swaps.length)
    block += `\nDirect substitutions they make:\n${m.phrase_swaps.map((s) => `- "${s.from}" → "${s.to}"`).join("\n")}`;
  if (m.notes.length) block += `\nEditor notes:\n${m.notes.map((n) => `- ${n}`).join("\n")}`;
  return block;
}

/** Load a user's style memory (null when none yet). Service-role read. */
export async function loadStyleMemory(userId: string): Promise<StyleMemory | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("user_style_memory")
    .select("memory")
    .eq("user_id", userId)
    .maybeSingle();
  const memory = data?.memory as StyleMemory | undefined;
  return isEmptyMemory(memory) ? null : (memory as StyleMemory);
}

/**
 * Record that an edit happened; returns true when enough edits accumulated
 * that the caller should trigger a distillation pass.
 */
export async function bumpEditCounter(userId: string): Promise<boolean> {
  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from("user_style_memory")
    .select("edits_since_distill")
    .eq("user_id", userId)
    .maybeSingle();

  const count = (existing?.edits_since_distill ?? 0) + 1;
  await supabase.from("user_style_memory").upsert({
    user_id: userId,
    edits_since_distill: count,
    updated_at: new Date().toISOString(),
  });
  return count >= DISTILL_THRESHOLD;
}

/**
 * Distill recent deltas + events into an updated style memory (one Haiku
 * call, Ink-metered). Returns the new memory, or null when there was nothing
 * to distill.
 */
export async function distillStyleMemory(userId: string): Promise<StyleMemory | null> {
  const supabase = createServerClient();

  const [{ data: deltas }, { data: events }, { data: memRow }] = await Promise.all([
    supabase
      .from("style_deltas")
      .select("delta, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("edit_events")
      .select("kind, instruction, before_text, after_text, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("user_style_memory")
      .select("memory, distill_count")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if ((deltas?.length ?? 0) === 0 && (events?.length ?? 0) === 0) return null;

  const existing = (memRow?.memory as StyleMemory | undefined) ?? null;
  const prompt = distillPrompt(existing, deltas ?? [], events ?? []);

  const result = await askClaudeWithUsage(DISTILL_SYSTEM, prompt, {
    model: "fast",
    maxTokens: 2048,
    temperature: 0.2,
  });
  await recordInkUsage(userId, null, "style_distill", "fast", result.usage);

  let memory: StyleMemory;
  try {
    memory = sanitizeMemory(JSON.parse(cleanJsonLite(result.text)));
  } catch (err) {
    logger.error("Style memory distill: parse failed", { userId, error: err });
    return null;
  }

  await supabase.from("user_style_memory").upsert({
    user_id: userId,
    memory,
    edits_since_distill: 0,
    distill_count: (memRow?.distill_count ?? 0) + 1,
    updated_at: new Date().toISOString(),
  });

  return memory;
}
