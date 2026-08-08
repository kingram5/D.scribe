"use client";
// Cross-component "generation in progress" flag (2026-08-08). Pages that run
// long AI work set a message here; PageShell reads it to warn before any step
// navigation, and a beforeunload handler covers tab close / refresh. A module
// singleton + event is used on purpose: PageShell and the page content are
// siblings, so a context would need a provider above both for no extra benefit.

let busyMessage: string | null = null;
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
  if (message) window.addEventListener("beforeunload", handleBeforeUnload);
  else window.removeEventListener("beforeunload", handleBeforeUnload);
  window.dispatchEvent(new Event(EVENT));
}

export function getGenerationBusy(): string | null {
  return busyMessage;
}

export function subscribeGenerationBusy(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
