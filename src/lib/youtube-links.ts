/**
 * YouTube link intake for the upload step.
 *
 * The intake took exactly one URL per fetch, so importing a series of
 * interviews meant one paste, one click and one 2-Ink charge, repeated. Parse
 * the whole paste instead: any mix of newlines, commas and spaces, deduped on
 * the video id so the same talk pasted twice is not transcribed and billed
 * twice.
 *
 * Pure module — no server imports — so the client component can use it.
 */

export interface ParsedYoutubeLinks {
  /** Canonical watch URLs, deduped, in the order the user pasted them. */
  urls: string[];
  /** Tokens that were not recognisable as a YouTube link. */
  invalid: string[];
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** The 11-character video id behind any YouTube URL shape, or null. */
export function youtubeVideoId(raw: string): string | null {
  let parsed: URL;
  try {
    // A pasted "youtu.be/x" has no scheme; assume https rather than rejecting it.
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\.|^m\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    return VIDEO_ID.test(id) ? id : null;
  }
  if (host !== "youtube.com" && host !== "music.youtube.com") return null;

  const v = parsed.searchParams.get("v");
  if (v && VIDEO_ID.test(v)) return v;

  const path = /^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/.exec(parsed.pathname);
  return path ? path[1] : null;
}

export function parseYoutubeLinks(input: string): ParsedYoutubeLinks {
  const urls: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const token of input.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)) {
    const id = youtubeVideoId(token);
    if (!id) {
      invalid.push(token);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    urls.push(`https://www.youtube.com/watch?v=${id}`);
  }

  return { urls, invalid };
}
