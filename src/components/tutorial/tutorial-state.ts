/** Tutorial persistence — mirrors the localStorage conventions used elsewhere
 *  (`ds_reached_*`, `dscribe_foreword_*`). Seen-state is global across projects:
 *  a returning author starting book #2 shouldn't be re-toured through every step.
 *  The `v1` suffix lets a future content overhaul re-show everything by bumping
 *  the key. */

const SEEN_KEY = "ds_tut_seen_v1";
const AUTO_OFF_KEY = "ds_tut_auto_off";

export function hasSeenTutorial(stepKey: string): boolean {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as string[]).includes(stepKey);
  } catch {
    return false;
  }
}

export function markTutorialSeen(stepKey: string) {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const seen: string[] = raw ? JSON.parse(raw) : [];
    if (!seen.includes(stepKey)) {
      seen.push(stepKey);
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
