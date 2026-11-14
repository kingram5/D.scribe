// Small shared helpers for page metadata (SEO/GEO plan Phase 1, 2026-11-14).
// Client-safe: constants and pure functions only.

/** Search results cut meta descriptions off at about 155 characters. */
export const MAX_DESCRIPTION = 155;

/** Split prose into sentences on ., ! or ? followed by whitespace. */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Build a description from whole sentences, in order, so it never ends
 * mid-sentence in a search result. A sentence that would push the total past
 * `max` is skipped and later, shorter ones still get a chance, so pass only
 * sentences that read fine on their own. If not even the first fits, it is cut
 * at the last word boundary and given an ellipsis.
 */
export function fitDescription(parts: readonly string[], max = MAX_DESCRIPTION): string {
  const clean = parts.map((s) => s.trim()).filter(Boolean);
  let out = "";
  for (const s of clean) {
    const next = out ? `${out} ${s}` : s;
    if (next.length <= max) out = next;
  }
  if (out) return out;
  const first = clean[0] ?? "";
  if (first.length <= max) return first;
  const cut = first.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

/**
 * The generated site card (src/app/opengraph-image.tsx). A page that sets its
 * own `openGraph` object replaces the inherited image, so pages without their
 * own card point back at this one or their social card renders with no image.
 */
export const DEFAULT_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "D.scribe — Turn Your Voice Into a Published Book with AI",
} as const;
