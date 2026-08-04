export interface DraftChapter {
  title: string;
  summary: string;
  key_point_ids: number[];
  narrative_arc?: string;
}

/**
 * Force the model's outline to match what the author asked for.
 *
 * The chapter count used to be a single line of prompt with nothing enforcing
 * it, so a request for 5 chapters routinely produced 4, 6 or 9 and the route
 * inserted whatever came back. Two invariants are repaired here, in order:
 *
 *   1. EXACTLY `want` chapters. Too many: repeatedly fold the chapter with the
 *      fewest key points into its smaller neighbour (no key point is ever
 *      dropped). Too few: split the fattest chapter's key points in half.
 *   2. Every key point index 1..totalKeyPoints appears EXACTLY once. Duplicates
 *      keep their first home; orphans are appended to the smallest chapter so
 *      the author's material can never silently vanish from the book.
 */
export function reconcileOutline(
  chapters: DraftChapter[],
  want: number,
  totalKeyPoints: number
): { chapters: DraftChapter[]; adjusted: boolean } {
  const out: DraftChapter[] = chapters.map((c) => ({
    ...c,
    key_point_ids: Array.isArray(c.key_point_ids) ? [...c.key_point_ids] : [],
  }));
  if (out.length === 0) return { chapters: out, adjusted: false };
  const before = out.length;

  // 1a. Too many chapters — merge the smallest into its smaller neighbour.
  while (out.length > want) {
    let sIdx = 0;
    for (let i = 1; i < out.length; i++) {
      if (out[i].key_point_ids.length < out[sIdx].key_point_ids.length) sIdx = i;
    }
    const prev = sIdx > 0 ? out[sIdx - 1] : null;
    const next = sIdx < out.length - 1 ? out[sIdx + 1] : null;
    if (!prev && !next) break; // single chapter, nothing to merge into
    const target =
      prev && next
        ? prev.key_point_ids.length <= next.key_point_ids.length ? sIdx - 1 : sIdx + 1
        : prev ? sIdx - 1 : sIdx + 1;
    const merged = out[sIdx];
    out[target].key_point_ids = target < sIdx
      ? [...out[target].key_point_ids, ...merged.key_point_ids]
      : [...merged.key_point_ids, ...out[target].key_point_ids];
    out.splice(sIdx, 1);
  }

  // 1b. Too few chapters — split the one carrying the most key points.
  while (out.length < want) {
    let bIdx = 0;
    for (let i = 1; i < out.length; i++) {
      if (out[i].key_point_ids.length > out[bIdx].key_point_ids.length) bIdx = i;
    }
    const big = out[bIdx];
    if (big.key_point_ids.length < 2) break; // nothing left to split honestly
    const half = Math.ceil(big.key_point_ids.length / 2);
    const tail = big.key_point_ids.slice(half);
    big.key_point_ids = big.key_point_ids.slice(0, half);
    out.splice(bIdx + 1, 0, {
      title: `${big.title} (continued)`,
      summary: big.summary,
      key_point_ids: tail,
      narrative_arc: big.narrative_arc,
    });
  }

  // 2. Every key point exactly once.
  const seen = new Set<number>();
  for (const ch of out) {
    ch.key_point_ids = ch.key_point_ids.filter((n) => {
      const valid = Number.isInteger(n) && n >= 1 && n <= totalKeyPoints;
      if (!valid || seen.has(n)) return false;
      seen.add(n);
      return true;
    });
  }
  const orphans: number[] = [];
  for (let n = 1; n <= totalKeyPoints; n++) if (!seen.has(n)) orphans.push(n);
  if (orphans.length > 0) {
    let sIdx = 0;
    for (let i = 1; i < out.length; i++) {
      if (out[i].key_point_ids.length < out[sIdx].key_point_ids.length) sIdx = i;
    }
    out[sIdx].key_point_ids.push(...orphans);
  }

  return { chapters: out, adjusted: before !== out.length || orphans.length > 0 };
}
