/** Tutorial persistence — mirrors the localStorage conventions used elsewhere
 *  (`ds_reached_*`, `dscribe_foreword_*`). Seen-state is global across projects:
 *  a returning author starting book #2 shouldn't be re-toured through every step.
 *  The `v1` suffix lets a future content overhaul re-show everything by bumping
 *  the key. */

const SEEN_KEY = "ds_tut_seen_v1";
const AUTO_OFF_KEY = "ds_tut_auto_off";

/**
 * Per-step content versions. Bumping one re-shows just that step's tour to
 * returning authors (stored as "transcript@2"), instead of re-touring every
 * step. Steps changed by speaker labels / Publisher-Ready are bumped once the
 * features are switched on.
 */
const TUTORIAL_VERSIONS: Record<string, number> = {
  ...(process.env.NEXT_PUBLIC_SPEAKER_LABELS === "true" ? { transcript: 3 } : {}),
  ...(process.env.NEXT_PUBLIC_PUBLISHER_READY === "true" ? { generate: 3, interview: 2 } : {}),
};

function seenId(stepKey: string): string {
  const v = TUTORIAL_VERSIONS[stepKey];
  return v && v > 1 ? `${stepKey}@${v}` : stepKey;
}

export function hasSeenTutorial(stepKey: string): boolean {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as string[]).includes(seenId(stepKey));
  } catch {
    return false;
  }
}

export function markTutorialSeen(stepKey: string) {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const seen: string[] = raw ? JSON.parse(raw) : [];
    const id = seenId(stepKey);
    if (!seen.includes(id)) {
      seen.push(id);
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    }
  } catch {
    /* storage unavailable — the tour will just re-offer next visit */
  }
}

/** The global "tutorials y/n" toggle. Defaults to ON. */
export function isTutorialAutoShowOn(): boolean {
  try {
    return localStorage.getItem(AUTO_OFF_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setTutorialAutoShow(on: boolean) {
  try {
    if (on) localStorage.removeItem(AUTO_OFF_KEY);
    else localStorage.setItem(AUTO_OFF_KEY, "1");
  } catch {
    /* ignore */
  }
}
