// Founder facts shared by /about (the homepage footer no longer uses them).
// Client-safe: constants only, no node imports.
//
// HeyCatch 2026-09-10 item 2. The story below is Kyle's, swapped in 2026-09-19
// exactly as he wrote it — do not edit his words. Still owed: the headshot file
// (drop it at public/founder-kyle.jpg and set headshot below).

export const FOUNDER = {
  name: "Kyle Ingram",
  initials: "KI",
  role: "Co-founder, D.scribe",
  location: "Dallas, Texas",
  email: "kyle@d-scribe.app",
  /**
   * Public URL of the headshot, or null while it is missing. Drop the file at
   * public/founder-kyle.jpg and set this to "/founder-kyle.jpg"; the /about
   * card switches from the initials placeholder to the photo.
   * (A constant, not a filesystem probe: public/ is not guaranteed to exist in
   * the serverless bundle at revalidation time.)
   */
  headshot: null as string | null,
} as const;

/**
 * Kyle's own words, verbatim (2026-09-19). Rendered as-is on /about — this is
 * his voice; grammar and brand capitalization are intentional.
 */
export const FOUNDER_STORY: readonly string[] | null = [
  "D.Scribe started in 2025 as a gift for one person.",
  "My wife's mom is a minister with a real gift for speaking. Put her in front of a room and the words just come. She had wanted to write a book for years, but every time she sat down to a blank page, she froze. Where do you start? How do you shape years of thoughts into chapters? The book lived in her voice, and the page kept getting in the way.",
  "So my wife and I built her a tool. She talks, freely, the way she always has, and it turns her words into written prose with a structure she can build on.",
  "It was supposed to be a fun family project. Then I started hearing the same story everywhere. Pastors, speakers, leaders, grandparents, everyday people with something worth saying, all carrying a book in their head and no way to get it onto paper. That's when D.Scribe stopped being a side project and became something I care about deeply.",
  "If you can say it, you can write it. We built D.Scribe to prove that.",
];

/** The closing signature line under the story, kept out of the paragraph flow. */
export const FOUNDER_SIGNATURE = "Kyle Ingram, co-founder";

