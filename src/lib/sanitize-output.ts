/**
 * Post-generation sanitizer — catches AI writing patterns that slip through prompt rules.
 * Belt-and-suspenders: the prompt says "don't", this function enforces it.
 *
 * Two hard rules (edge-test 2026-08-02):
 *   - NEVER rewrite inside quotation marks. Quoted speech is the author's
 *     source material — silently editing what a named person said is a
 *     product-integrity failure, not a style save.
 *   - Words in ai-tells' SOFT_TELLS are only tells in figurative/filler use.
 *     The linter already counts them at reduced weight; this file must not
 *     rewrite them destructively ("3x leverage" → "3x use" shreds a finance
 *     memoir). The soft set is consulted at module load, so the two stay in sync.
 */

import { SOFT_TELLS } from "./ai-tells";

// Em dashes → comma, but ONLY mid-sentence between words. A line-leading dash
// (dialogue convention) or an interruption dash ("I was going to—") is
// punctuation the author chose, not an AI tell.
function replaceEmDashes(text: string): string {
  return text
    .replace(/([A-Za-z0-9])\s*—\s*(?=[A-Za-z0-9])/g, "$1, ")
    // Clean up double commas or comma-period combos
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".");
}

// Catch common AI cliché phrases and neutralize them. Entries carrying a third
// element name their base word; if that word is in SOFT_TELLS the entry is
// filtered out of the active set (legitimate domain use outweighs the tell).
type PhraseRule = [RegExp, string] | [RegExp, string, string];

const AI_PHRASES: PhraseRule[] = [
  [/\bin today's world\b/gi, "today"],
  [/\bin this day and age\b/gi, "now"],
  [/\bnow more than ever\b/gi, "now"],
  [/\bat the end of the day\b/gi, "ultimately"],  // lesser evil
  [/\bwhen all is said and done\b/gi, "in the end"],
  [/\bit's worth noting that\b/gi, ""],
  [/\bit's important to note that\b/gi, ""],
  [/\binterestingly,?\s*/gi, ""],
  [/\bdeep dive\b/gi, "close look"],
  [/\bdive deep(er)?\b/gi, "look closer"],
  [/\blean(ing)? into\b/gi, "embracing"],
  [/\bdouble down on\b/gi, "commit to"],
  [/\bgame[- ]changer\b/gi, "shift"],
  [/\bparadigm shift\b/gi, "shift"],
  [/\brich tapestry\b/gi, "fabric"],
  [/\btapestry of\b/gi, "fabric of"],
  // Article captured and restored — the old replacement ate it ("work through rate cycle").
  [/\bnavigate (the |this |these )/gi, "work through $1", "navigate"],
  [/\bleverage\b/gi, "use", "leverage"],
  [/\butilize\b/gi, "use"],
  [/\brobust\b/gi, "strong", "robust"],
  [/\bseamless(ly)?\b/gi, "smooth$1", "seamless"],
  [/\btransformative\b/gi, "powerful"],
  [/\bgroundbreaking\b/gi, "original"],
  [/\bcutting[- ]edge\b/gi, "modern"],
  [/\ba testament to\b/gi, "proof of"],
  [/\bserves as a reminder\b/gi, "reminds us"],
  [/\bspeaks volumes\b/gi, "says a lot"],
  [/\bresonate(s)? with\b/gi, "connect$1 with", "resonate"],
  [/\bpivotal\b/gi, "key"],
  [/\bnuanced\b/gi, "subtle"],
  [/\bmultifaceted\b/gi, "complex"],
  [/\bunlock(s|ing)?\b/gi, "open$1", "unlock"],
  [/\brevolutionize(s|d)?\b/gi, "change$1"],
  [/\bempower(s|ing|ed)?\b/gi, "help$1"],
  [/\belevate(s|d)?\b/gi, "raise$1", "elevate"],
  [/\bharness(es|ing)?\b/gi, "use$1"],
  [/\bdelve(s|d)?\b/gi, "look$1"],
  [/\bembark(s|ed|ing)? on\b/gi, "start$1"],
  [/\ba myriad of\b/gi, "many"],
  [/\ba plethora of\b/gi, "many"],
  [/\bin essence,?\s*/gi, ""],
  [/\bneedless to say,?\s*/gi, ""],
  [/\bit goes without saying that\s*/gi, ""],
];

const ACTIVE_PHRASES: [RegExp, string][] = AI_PHRASES
  .filter((rule) => !(rule[2] && SOFT_TELLS.has(rule[2])))
  .map((rule) => [rule[0], rule[1]]);

function replaceAIPhrases(text: string): string {
  let result = text;
  for (const [pattern, replacement] of ACTIVE_PHRASES) {
    result = result.replace(pattern, replacement);
  }
  // Clean up double spaces from removed phrases
  return result.replace(/  +/g, " ").replace(/ ([.,;])/g, "$1");
}

// Third-person self-reference slips → first person.
// Only the possessive form is rewritten ("the author's voice" -> "my voice") because
// it maps cleanly to "my" without breaking verb agreement. Subject/object forms
// ("the author believes") are left to the first-person POV prompt rule to avoid mangling.
function fixSelfReference(text: string): string {
  return text.replace(/\bthe (?:author|speaker|writer|narrator)['’]s\b/gi, "my");
}

// Quoted spans (straight or curly, single-line, bounded so an unbalanced quote
// can't swallow paragraphs). Odd indices after a capturing split are the quotes.
const QUOTED_SPAN = /("[^"\n]{0,600}"|“[^”\n]{0,600}”)/g;

function outsideQuotes(text: string, transform: (segment: string) => string): string {
  const parts = text.split(QUOTED_SPAN);
  return parts.map((part, i) => (i % 2 === 1 ? part : transform(part))).join("");
}

/**
 * Sanitize generated chapter content.
 * Call this on ASSEMBLED text between Claude output and database save — never
 * on individual stream deltas (the trailing trim eats the token's leading
 * space at every delta boundary and fuses words).
 */
export function sanitizeGenerated(text: string): string {
  const result = outsideQuotes(text, (seg) =>
    fixSelfReference(replaceAIPhrases(replaceEmDashes(seg)))
  );
  return result.trim();
}
