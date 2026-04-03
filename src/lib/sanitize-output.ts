/**
 * Post-generation sanitizer — catches AI writing patterns that slip through prompt rules.
 * Belt-and-suspenders: the prompt says "don't", this function enforces it.
 */

// Em dashes → comma or period based on context
function replaceEmDashes(text: string): string {
  // "word — word" → "word, word" (mid-sentence)
  // "word —word" or "word— word" variants
  return text
    .replace(/\s*—\s*/g, ", ")
    // Clean up double commas or comma-period combos
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".");
}

// Catch common AI cliché phrases and neutralize them
const AI_PHRASES: [RegExp, string][] = [
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
  [/\bnavigate (?:the |this |these )/gi, "work through "],
  [/\bleverage\b/gi, "use"],
  [/\butilize\b/gi, "use"],
  [/\brobust\b/gi, "strong"],
  [/\bseamless(ly)?\b/gi, "smooth$1"],
  [/\btransformative\b/gi, "powerful"],
  [/\bgroundbreaking\b/gi, "original"],
  [/\bcutting[- ]edge\b/gi, "modern"],
  [/\ba testament to\b/gi, "proof of"],
  [/\bserves as a reminder\b/gi, "reminds us"],
  [/\bspeaks volumes\b/gi, "says a lot"],
  [/\bresonate(s)? with\b/gi, "connect$1 with"],
  [/\bpivotal\b/gi, "key"],
  [/\bnuanced\b/gi, "subtle"],
  [/\bmultifaceted\b/gi, "complex"],
  [/\bunlock(s|ing)?\b/gi, "open$1"],
  [/\brevolutionize(s|d)?\b/gi, "change$1"],
  [/\bempower(s|ing|ed)?\b/gi, "help$1"],
  [/\belevate(s|d)?\b/gi, "raise$1"],
  [/\bharness(es|ing)?\b/gi, "use$1"],
  [/\bdelve(s|d)?\b/gi, "look$1"],
  [/\bembark(s|ed|ing)? on\b/gi, "start$1"],
  [/\ba myriad of\b/gi, "many"],
  [/\ba plethora of\b/gi, "many"],
  [/\bin essence,?\s*/gi, ""],
  [/\bneedless to say,?\s*/gi, ""],
  [/\bit goes without saying that\s*/gi, ""],
];

function replaceAIPhrases(text: string): string {
  let result = text;
  for (const [pattern, replacement] of AI_PHRASES) {
    result = result.replace(pattern, replacement);
  }
  // Clean up double spaces from removed phrases
  return result.replace(/  +/g, " ").replace(/ ([.,;])/g, "$1");
}

/**
 * Sanitize generated chapter content.
 * Call this between Claude output and database save.
 */
export function sanitizeGenerated(text: string): string {
  let result = text;
  result = replaceEmDashes(result);
  result = replaceAIPhrases(result);
  return result.trim();
}
