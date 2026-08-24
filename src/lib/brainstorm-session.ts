/** Shared brainstorm pause/resume helpers. Keep this module free of I/O. */

export const BRAINSTORM_MESSAGES_MAX_BYTES = 1_000_000;
export const BRAINSTORM_LENGTH_NUDGE_TURNS = 40;

export type BrainstormMessage = {
  role: "user" | "assistant";
  content: string;
};

export type BrainstormSessionCopy = {
  messages: BrainstormMessage[];
  draft?: string;
};

export type BrainstormSessionRecord = {
  id: string;
  project_id: string;
  user_id: string;
  messages: BrainstormMessage[];
  status: "active" | "finished" | "discarded";
  turn_count: number;
  created_at: string;
  updated_at: string;
};

export function isBrainstormMessage(value: unknown): value is BrainstormMessage {
  return typeof value === "object" && value !== null &&
    ((value as BrainstormMessage).role === "user" || (value as BrainstormMessage).role === "assistant") &&
    typeof (value as BrainstormMessage).content === "string";
}

export function sanitizeBrainstormMessages(value: unknown): BrainstormMessage[] | null {
  if (!Array.isArray(value)) return null;
  const messages = value.filter(isBrainstormMessage);
  return messages.length === value.length ? messages : null;
}

export function messagesPayloadBytes(messages: BrainstormMessage[]): number {
  return new TextEncoder().encode(JSON.stringify(messages)).length;
}

/**
 * Pick the resume copy. More messages wins; ties go to the server so a
 * cross-device pause beats a stale on-device draft of the same length.
 * Draft text is local-only and rides along when the winner is local, or when
 * both sides have the same transcript (the author may still be mid-answer).
 */
export function pickBrainstormResume(
  server: BrainstormSessionCopy | null,
  local: BrainstormSessionCopy | null,
): BrainstormSessionCopy | null {
  const serverMessages = server?.messages ?? [];
  const localMessages = local?.messages ?? [];
  const serverDraft = typeof server?.draft === "string" ? server.draft : "";
  const localDraft = typeof local?.draft === "string" ? local.draft : "";

  if (serverMessages.length === 0 && localMessages.length === 0) {
    const draft = localDraft || serverDraft;
    return draft ? { messages: [], draft } : null;
  }

  if (localMessages.length > serverMessages.length) {
    return { messages: localMessages, draft: localDraft };
  }

  return {
    messages: serverMessages,
    draft: serverMessages.length === localMessages.length ? localDraft || serverDraft : serverDraft,
  };
}

export function userTurnCount(messages: BrainstormMessage[]): number {
  return messages.filter((m) => m.role === "user").length;
}

/** Warm relative time for "last touched …" — no "session" wording. */
export function formatRelativeTouched(iso: string, nowMs = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "just now";
  const deltaSec = Math.max(0, Math.round((nowMs - then) / 1000));
  if (deltaSec < 45) return "just now";
  const minutes = Math.round(deltaSec / 60);
  if (minutes < 60) return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "yesterday" : `${days} days ago`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "a week ago" : `${weeks} weeks ago`;
}
