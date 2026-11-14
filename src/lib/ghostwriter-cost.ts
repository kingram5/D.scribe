// The one ghostwriter cost figure the site quotes, with its source (Kyle
// 2026-11-14: one credible, citable range, the same on /about and /pricing).
// Until then /about said $10,000-$50,000 and /pricing said $30,000-$80,000,
// neither sourced.
//
// Source: Reedsy, "How Much Does It Cost to Hire a Ghostwriter? [Rates and
// Fees]" (updated Jun 2, 2026): "a professional ghostwriter typically costs
// between $18,000 and $50,000 for nonfiction books". Checked 2026-11-14.
// D.scribe books are nonfiction (sermons, talks, coaching), so the nonfiction
// range is the honest comparison. If the source changes, change it here only.
//
// Client-safe: constants only.

export const GHOSTWRITER_COST = {
  /** Display range, en-dash free so it reads the same in copy and images. */
  range: "$18,000 to $50,000",
  scope: "for a nonfiction book",
  source: "Reedsy",
  sourceTitle: "How Much Does It Cost to Hire a Ghostwriter?",
  url: "https://reedsy.com/blog/guide/ghostwriter/cost-to-hire/",
  checked: "2026-11-14",
} as const;

/** "A professional ghostwriter typically costs $18,000 to $50,000 for a nonfiction book" */
export const GHOSTWRITER_COST_SENTENCE = `A professional ghostwriter typically costs ${GHOSTWRITER_COST.range} ${GHOSTWRITER_COST.scope}`;
