// Founder facts shared by /about and the homepage footer block.
// Client-safe: constants only, no node imports.
//
// HeyCatch 2026-09-10 item 2. Kyle still owes: the headshot file and his 2-3
// sentence "why I built this" note. Nothing here is written in his voice; the
// story slot is a visible placeholder until he writes it (see
// FOUNDER_STORY_PLACEHOLDER below).

export const FOUNDER = {
  name: "Kyle Ingram",
  initials: "KI",
  role: "Founder, D.scribe",
  location: "Dallas, Texas",
  email: "kyle@d-scribe.app",
  /**
   * Public URL of the headshot, or null while it is missing. Drop the file at
   * public/founder-kyle.jpg and set this to "/founder-kyle.jpg"; both /about and
   * the homepage footer switch from the initials placeholder to the photo.
   * (A constant, not a filesystem probe: public/ is not guaranteed to exist in
   * the serverless bundle at revalidation time.)
   */
  headshot: null as string | null,
} as const;

/**
 * Kyle's own words go here. Until he writes them, this stays null and the
 * page renders an obvious placeholder box instead of invented copy.
 */
export const FOUNDER_STORY: readonly string[] | null = null;

export const FOUNDER_STORY_PLACEHOLDER =
  "Placeholder. Kyle writes this part himself: two or three sentences on why he built D.scribe, in his own voice. Set FOUNDER_STORY in src/lib/founder.ts to publish it.";
