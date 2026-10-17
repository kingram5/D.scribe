"use client";

const PREFIX = "ds:live-draft:";
const ACCOUNT_KEY = "ds:live-draft-account";
export const LIVE_DRAFT_EVENT = "ds:live-draft";
let activeAccount: string | null = null;
// Contains identities only, never author text. Keep pending requests locked even
// across component remounts or account changes until the original request settles.
const pendingSaves = new Set<string>();
const notify = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(LIVE_DRAFT_EVENT)); };
export const liveDraftKey = (accountId: string, runId: string) => `${PREFIX}v2:${accountId}:${runId}`;

export function setLiveDraftAccount(accountId: string | null) {
  activeAccount = accountId;
  try {
    const previous = sessionStorage.getItem(ACCOUNT_KEY);
    if (!accountId || previous !== accountId) {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key);
      }
    }
    if (accountId) sessionStorage.setItem(ACCOUNT_KEY, accountId);
    else sessionStorage.removeItem(ACCOUNT_KEY);
  } catch { /* Unavailable storage cannot provide recovery; writes report that. */ }
  notify();
}

export const isLiveDraftAccount = (accountId: string) => activeAccount === accountId;

export function readLiveDraft(accountId: string, key: string): string {
  if (activeAccount !== accountId || !key.startsWith(`${PREFIX}v2:${accountId}:`)) return "";
  try { return sessionStorage.getItem(key) ?? ""; } catch { return ""; }
}
export function writeLiveDraft(accountId: string, key: string, value: string): boolean {
  // Late promises from a logged-out component must never restore purged text.
  if (activeAccount !== accountId || !key.startsWith(`${PREFIX}v2:${accountId}:`)) return false;
  sessionStorage.setItem(key, value);
  notify();
  return true;
}
export function subscribeLiveDraft(notifyChange: () => void) {
  window.addEventListener(LIVE_DRAFT_EVENT, notifyChange);
  window.addEventListener("storage", notifyChange);
  return () => {
    window.removeEventListener(LIVE_DRAFT_EVENT, notifyChange);
    window.removeEventListener("storage", notifyChange);
  };
}
export function isDraftSavePending(key: string) { return pendingSaves.has(key); }
export function beginDraftSave(accountId: string, key: string) {
  if (activeAccount !== accountId || pendingSaves.has(key)) return false;
  pendingSaves.add(key); notify(); return true;
}
export function finishDraftSave(key: string) { pendingSaves.delete(key); notify(); }
