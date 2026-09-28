/**
 * Voice picker (Kyle 2026-09-27): "Which would you actually SAY out loud?"
 *
 * Rules that make the signal worth having (agreed with Kyle):
 *  1. Pairs rewrite a real sentence from the author's own draft, so they judge
 *     voice, not topic.
 *  2. Each pair differs on ONE dimension, so every pick moves one clear dial.
 *  3. The question is "which would you say", with "neither" + a box to say it
 *     their way (those rewrites are the strongest signal of all).
 *  4. One anchor pair: their own spoken words vs a polished rewrite. Picking
 *     the polish means their other picks lean toward "sounds better", so they
 *     are discounted.
 *  5. Account level, once per author, refined over time.
 */

import { callClaudeNext, parseJsonReply } from "@/lib/claude-next";
import type { ClaudeUsage } from "@/lib/claude-lite";

export interface Dimension {
  key: string;
  /** Pole written as option "low" (dial -1) and "high" (dial +1). */
  low: string;
  high: string;
  /** How the writer should read each end of the dial. */
  lowRule: string;
  highRule: string;
}

export const DIMENSIONS: Dimension[] = [
  { key: "length", low: "short", high: "long", lowRule: "Keep sentences short and punchy.", highRule: "Let sentences run long and build." },
  { key: "formality", low: "relaxed", high: "composed", lowRule: "Stay relaxed and conversational (contractions, everyday words).", highRule: "Keep a composed, measured register." },
  { key: "directness", low: "blunt", high: "gentle", lowRule: "Say things bluntly; no softening.", highRule: "Soften hard points; lead with care." },
  { key: "imagery", low: "literal", high: "with one image", lowRule: "Say it plainly; few metaphors.", highRule: "Reach for images and comparisons." },
  { key: "order", low: "story first", high: "point first", lowRule: "Open with the story or moment, let the point emerge.", highRule: "State the point, then back it with the story." },
  { key: "texture", low: "rough", high: "clean", lowRule: "Keep the spoken roughness: fragments, asides, repetition for emphasis.", highRule: "Tidy the rough edges into clean sentences." },
];

export type Dials = Record<string, number>;

export interface PairRow {
  id?: string;
  dimension: string;
  source_sentence: string;
  option_a: string;
  option_b: string;
  /** Which pole option A leans toward ("short", "spoken", …). */
  a_pole: string;
}

export interface Pick {
  dimension: string;
  a_pole: string;
  choice: "a" | "b" | "neither";
}

/** Dial movement for one pick: +1 toward "high", -1 toward "low", 0 for neither/anchor. */
export function pickDirection(p: Pick): number {
  if (p.dimension === "anchor" || p.choice === "neither") return 0;
  const dim = DIMENSIONS.find((d) => d.key === p.dimension);
  if (!dim) return 0;
  const chosenPole = p.choice === "a" ? p.a_pole : p.a_pole === dim.low ? dim.high : dim.low;
  return chosenPole === dim.high ? 1 : -1;
}

/**
 * Dials from all picks: the average direction per dimension, in [-1, 1].
 * Pure; the caller persists the result.
 */
export function computeDials(picks: Pick[]): { dials: Dials; polishBias: number } {
  const sums: Record<string, { total: number; n: number }> = {};
  let anchors = 0;
  let polished = 0;
  for (const p of picks) {
    if (p.dimension === "anchor") {
      if (p.choice === "neither") continue;
      anchors++;
      // In an anchor pair, pole "spoken" is their own words, "polished" the rewrite.
      const chosePolished = (p.choice === "a" && p.a_pole === "polished") || (p.choice === "b" && p.a_pole === "spoken");
      if (chosePolished) polished++;
      continue;
    }
    const dir = pickDirection(p);
    if (!sums[p.dimension]) sums[p.dimension] = { total: 0, n: 0 };
    sums[p.dimension].total += dir;
    sums[p.dimension].n += 1;
  }
  const dials: Dials = {};
  for (const [k, v] of Object.entries(sums)) dials[k] = Math.round((v.total / v.n) * 100) / 100;
  return { dials, polishBias: anchors ? polished / anchors : 0 };
}

/**
 * Writer instruction from the dials. Empty when there is nothing confident to
 * say, so authors who never used the picker get an unchanged prompt.
 */
export function voiceDialsBlock(dials: Dials | null | undefined, polishBias = 0, rewrites: string[] = []): string {
  if (!dials && !rewrites.length) return "";
  // A polish-biased author's "long / clean / formal" picks are the ones most
  // likely to be "sounds better" rather than "sounds like me": halve them.
  const discount = polishBias >= 0.5 ? 0.5 : 1;
  const lines: string[] = [];
  for (const dim of DIMENSIONS) {
    const raw = dials?.[dim.key];
    if (raw == null) continue;
    const v = raw > 0 ? raw * discount : raw;
    if (Math.abs(v) < 0.5) continue;
    lines.push(`- ${v > 0 ? dim.highRule : dim.lowRule}${Math.abs(v) >= 0.9 ? " (strong preference)" : ""}`);
  }
  if (polishBias >= 0.5) lines.push("- When in doubt between a polished line and how they'd actually say it out loud, choose how they'd say it.");
  const examples = rewrites.filter((r) => r && r.trim().length > 10).slice(-5);
  if (!lines.length && !examples.length) return "";
  let block = "\n\nAUTHOR'S VOICE PICKS (the author chose, sentence by sentence, how they would actually say things):";
  if (lines.length) block += `\n${lines.join("\n")}`;
  if (examples.length) block += `\nLines they rewrote in their own words (match this voice):\n${examples.map((e) => `- "${e.trim()}"`).join("\n")}`;
  return block;
}

// ─── Pair generation ─────────────────────────────────────────────────────────

const PAIR_SCHEMA = {
  type: "object",
  properties: {
    pairs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          low_version: { type: "string" },
          high_version: { type: "string" },
        },
        required: ["index", "low_version", "high_version"],
        additionalProperties: false,
      },
    },
  },
  required: ["pairs"],
  additionalProperties: false,
} as const;

const PAIR_SYSTEM = `You write sentence pairs for a voice test. For each item you get one sentence from the author's book and one style dimension with two ends. Rewrite the sentence twice: once leaning to the first end, once leaning to the second.

The two versions should sound like two real, good speakers with different habits, not a good version and a bad one. Keep the shift moderate and natural: no caricature, no stiff or purple extremes ("I would like to ask something of you before we proceed" is too stiff; "glimmers with everything" is too purple). A reader should find both perfectly acceptable and choose purely on which sounds more like them.

Good pairs look like this:
- formality: "I've got to ask you something before we go on." / "Before we go further, I need to ask you something."
- imagery: "That gap tells you why this matters." / "That gap is the crack of light that shows why this matters."
- directness: "It ended over something stupid." / "It ended over something that, honestly, was pretty small."
If the original sentence already leans clearly to one end, you may use it unchanged as that side.

Rules: keep the meaning and every fact identical; change ONLY the named dimension, holding everything else close to the original; keep both versions within about ten words of each other in length unless the dimension is length; never use em dashes.`;

const ANCHOR_SCHEMA = {
  type: "object",
  properties: { polished: { type: "string" } },
  required: ["polished"],
  additionalProperties: false,
} as const;

const ANCHOR_SYSTEM = `Rewrite this spoken sentence the way a polished nonfiction book would put it: smooth, correct, tidy. Keep the meaning. One sentence. Never use em dashes.`;

/** Sentences from a draft that make good test material: 12-35 words, no quotes. */
export function pickSourceSentences(draft: string, count: number): string[] {
  const sentences = draft
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => {
      const n = s.split(" ").length;
      return n >= 12 && n <= 35 && !/["“”]/.test(s) && !s.startsWith("#");
    });
  if (sentences.length <= count) return sentences;
  // Spread picks across the chapter instead of taking the opening.
  const step = sentences.length / count;
  return Array.from({ length: count }, (_, i) => sentences[Math.floor(i * step + step / 2)]);
}

/** Randomize which side is shown as "A" so position can't bias the pick. */
function arrange(dimension: string, source: string, low: string, high: string, lowPole: string, highPole: string, flip: boolean): PairRow {
  return flip
    ? { dimension, source_sentence: source, option_a: high, option_b: low, a_pole: highPole }
    : { dimension, source_sentence: source, option_a: low, option_b: high, a_pole: lowPole };
}

/**
 * Build the pairs: one per dimension from the author's draft sentences, plus
 * one anchor pair from their own spoken words when available.
 */
export async function generatePairs(opts: {
  draft: string;
  spokenLine?: string | null;
  dimensions?: Dimension[];
  random?: () => number;
}): Promise<{ pairs: PairRow[]; usage: ClaudeUsage[] }> {
  const rand = opts.random ?? Math.random;
  // "order" needs a passage, not one sentence, so the default set skips it.
  const dims = opts.dimensions ?? DIMENSIONS.filter((d) => d.key !== "order");
  const sources = pickSourceSentences(opts.draft, dims.length);
  const usage: ClaudeUsage[] = [];
  const pairs: PairRow[] = [];

  if (sources.length) {
    const items = sources.map((s, i) => `${i}. SENTENCE: ${s}\n   DIMENSION: ${dims[i].key}. First end: ${dims[i].low}. Second end: ${dims[i].high}.`).join("\n");
    const res = await callClaudeNext(PAIR_SYSTEM, items, {
      model: "sonnet5", effort: "medium", maxTokens: 12000, jsonSchema: PAIR_SCHEMA as unknown as Record<string, unknown>,
    });
    usage.push(res.usage);
    const out = parseJsonReply<{ pairs: { index: number; low_version: string; high_version: string }[] }>(res.text);
    for (const p of out.pairs ?? []) {
      const dim = dims[p.index];
      const src = sources[p.index];
      if (!dim || !src || !p.low_version || !p.high_version || p.low_version === p.high_version) continue;
      pairs.push(arrange(dim.key, src, p.low_version.trim(), p.high_version.trim(), dim.low, dim.high, rand() < 0.5));
    }
  }

  const spoken = opts.spokenLine?.replace(/\s+/g, " ").trim();
  if (spoken && spoken.split(" ").length >= 8) {
    const res = await callClaudeNext(ANCHOR_SYSTEM, spoken, {
      model: "sonnet5", effort: "low", maxTokens: 2000, jsonSchema: ANCHOR_SCHEMA as unknown as Record<string, unknown>,
    });
    usage.push(res.usage);
    const { polished } = parseJsonReply<{ polished: string }>(res.text);
    if (polished && polished.trim() !== spoken) {
      pairs.push(arrange("anchor", spoken, spoken, polished.trim(), "spoken", "polished", rand() < 0.5));
    }
  }
  return { pairs, usage };
}
