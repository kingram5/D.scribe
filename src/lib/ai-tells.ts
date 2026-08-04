/**
 * AI-tell definitions used by the voice-match linter.
 *
 * The generation prompt (HUMANIZER_RULES in prompts/generate.ts) bans the same
 * phrases in prose form. That prompt text is deliberately NOT built from this
 * list — rewording a shipped prompt changes generation behavior — so sync is
 * enforced by a unit test instead: every phrase here must appear in
 * HUMANIZER_RULES. Add a phrase in one place and the test points you to the other.
 */

/** Banned phrases, grouped as they appear in the humanizer prompt (one line per group). */
export const BANNED_PHRASE_GROUPS: string[][] = [
  ["no fluff", "let's be real", "real talk", "here's the thing", "here's the deal"],
  ["in today's world", "in this day and age", "now more than ever"],
  ["at the end of the day", "when all is said and done"],
  ["it's worth noting", "it's important to note", "interestingly"],
  ["dive deep", "deep dive", "unpack", "lean into", "double down"],
  ["game-changer", "paradigm shift", "landscape", "tapestry", "journey"],
  ["navigate", "leverage", "utilize"],
  ["robust", "seamless", "comprehensive", "ultimately", "furthermore"],
  ["transformative", "groundbreaking", "cutting-edge"],
  ["a testament to", "serves as a reminder", "speaks volumes"],
  ["the reality is", "the truth is", "the fact of the matter"],
  ["resonate", "pivotal", "nuanced", "multifaceted"],
  ["unlock", "revolutionize", "empower", "elevate", "harness"],
  ["delve", "embark", "myriad", "plethora", "meld"],
  ["it goes without saying", "needless to say", "suffice it to say"],
  ["in essence", "in summary", "to put it simply", "in other words"],
];

export const BANNED_PHRASES: string[] = BANNED_PHRASE_GROUPS.flat();

/**
 * Words on the list that are only tells in figurative/filler use. The linter
 * counts them at reduced weight; the prompt still bans them outright.
 */
export const SOFT_TELLS = new Set([
  "navigate",
  "landscape",
  "journey",
  "unlock",
  "elevate",
  "resonate",
  "ultimately",
  "furthermore",
  "comprehensive",
  "robust",
  "seamless",
  // Noun use ("3x leverage") is legitimate domain vocabulary; only the verb is
  // a tell. Soft so the sanitizer leaves it alone and the linter just flags it.
  "leverage",
]);

/**
 * Negation-flip / antithesis patterns — the #1 AI tell.
 * Covers: "not just X, but Y" / "It's not X, it's Y" / "This isn't about X,
 * it's about Y" / "Not X. Rather, Y." / "X isn't Y; it's Z."
 */
export const NEGATION_FLIP_PATTERNS: RegExp[] = [
  /\bnot\s+(?:just|only|merely|simply)\s+[^.!?;]{2,60}?[,;]?\s*but\b/gi,
  /\b(?:it|that|this|he|she)(?:'s|\s+is)\s+not\s+(?:about\s+)?[^.!?;]{2,60}?[.;,]\s*(?:it|that|this)(?:'s|\s+is)\b/gi,
  /\b(?:isn't|aren't|wasn't|weren't)\s+(?:about\s+)?[^.!?;]{2,60}?[.;,]\s*(?:it|that|this|they)(?:'s|\s+is|\s+are)\b/gi,
  /\bnot\s+[^.!?;]{2,50}?\.\s+(?:rather|instead)\b/gi,
  /\b[^.!?;]{2,50}?\s+isn't\s+[^.!?;]{2,40}?;\s*(?:it|that|this)(?:'s|\s+is)\b/gi,
];

/** Build the banned-phrases section of the humanizer prompt from the shared groups. */
export function bannedPhrasesPromptBlock(): string {
  return BANNED_PHRASE_GROUPS.map(
    (group) => `- ${group.map((p) => `"${p}"`).join(" / ")}`
  ).join("\n");
}
