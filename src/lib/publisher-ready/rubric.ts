/**
 * The Publisher-Ready rubric: what agents and acquisitions editors reject on,
 * per the 9/27 research (first-pages hook, craft on page one, specificity,
 * AI tells). Shared by the editor step, the scoreboard judge and the user-facing
 * band, so all three measure the same thing. Each criterion scores 0-2.
 */

export interface Criterion {
  key: string;
  label: string;
  /** What a 2 looks like, stated for the judge. */
  strong: string;
  /** What a 0 looks like. */
  weak: string;
}

export const RUBRIC: Criterion[] = [
  {
    key: "hook",
    label: "Opening pull",
    strong: "The first paragraphs create a question or tension that makes the reader keep going.",
    weak: "Opens on throat-clearing, summary, or a generic statement.",
  },
  {
    key: "momentum",
    label: "Momentum",
    strong: "Each section pulls into the next; nothing drifts or repeats itself.",
    weak: "Drifts, restates, or stalls; sections could be reordered without loss.",
  },
  {
    key: "specificity",
    label: "Specific detail",
    strong: "Named people, places, numbers, sensory detail and concrete moments carry the chapter.",
    weak: "Mostly abstract claims and generic description anyone could have written.",
  },
  {
    key: "rhythm",
    label: "Human rhythm",
    strong: "Sentence and paragraph lengths vary naturally; the prose has a pulse.",
    weak: "Uniform sentence lengths, same paragraph shape, list-of-three habits.",
  },
  {
    key: "no_tells",
    label: "No AI tells",
    strong: "No stock AI phrasing, negation flips, strained metaphors or em-dash habits.",
    weak: "Several recognizable AI patterns a trained reader would flag.",
  },
  {
    key: "voice",
    label: "Author's voice",
    strong: "Sounds like one particular person talking, consistent with their source material.",
    weak: "Sounds like a generic narrator; could be anyone's book.",
  },
  {
    key: "credibility",
    label: "Credibility",
    strong: "Every factual claim, quote and number traces to the author's source or is common knowledge.",
    weak: "Contains claims, quotes or figures that appear invented.",
  },
];

export const RUBRIC_MAX = RUBRIC.length * 2;

export function rubricPromptBlock(): string {
  return `RUBRIC (score each 0, 1 or 2):
${RUBRIC.map((c) => `- ${c.key} (${c.label}): 2 = ${c.strong} 0 = ${c.weak}`).join("\n")}`;
}

/** Total score across criteria, clamped to 0-2 per criterion. */
export function rubricTotal(scores: Record<string, number>): number {
  return RUBRIC.reduce((sum, c) => sum + Math.max(0, Math.min(2, Math.round(scores[c.key] ?? 0))), 0);
}

export type Band = "Needs work" | "Getting there" | "Publisher-ready";

/** User-facing band. Our own measure, never a promise about any publisher. */
export function bandFor(scores: Record<string, number>): Band {
  const pct = rubricTotal(scores) / RUBRIC_MAX;
  if (pct >= 0.8) return "Publisher-ready";
  if (pct >= 0.55) return "Getting there";
  return "Needs work";
}
