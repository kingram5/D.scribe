"use client";
// Cross-component "generation in progress" flag (2026-08-08). Pages that run
// long AI work set a message here; PageShell reads it to warn before any step
// navigation, and a beforeunload handler covers tab close / refresh. A module
// singleton + event is used on purpose: PageShell and the page content are
// siblings, so a context would need a provider above both for no extra benefit.

let busyMessage: string | null = null;
let unsavedMessage: string | null = null;
const EVENT = "ds-generation-busy-change";

function handleBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  // Chrome requires returnValue to be set for the native leave prompt.
  e.returnValue = "";
}

export function setGenerationBusy(message: string | null) {
  if (busyMessage === message) return;
  busyMessage = message;
  if (typeof window === "undefined") return;
  if (busyMessage || unsavedMessage) window.addEventListener("beforeunload", handleBeforeUnload);
  else window.removeEventListener("beforeunload", handleBeforeUnload);
  window.dispatchEvent(new Event(EVENT));
}

/** Navigation protection is independent of the generation/wake-lock signal. */
export function setUnsavedEdits(message: string | null) {
  if (unsavedMessage === message) return;
  unsavedMessage = message;
  if (typeof window === "undefined") return;
  if (busyMessage || unsavedMessage) window.addEventListener("beforeunload", handleBeforeUnload);
  else window.removeEventListener("beforeunload", handleBeforeUnload);
  window.dispatchEvent(new Event(EVENT));
}

export function getNavigationWarning(): string | null { return unsavedMessage || busyMessage; }

export function getGenerationBusy(): string | null {
  return busyMessage;
}

export function subscribeGenerationBusy(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
