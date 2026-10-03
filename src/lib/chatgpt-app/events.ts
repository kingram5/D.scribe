import { logger } from "@/lib/logger";

/**
 * Funnel events for the ChatGPT app. Shipped to the existing structured logger
 * (Axiom in production), never to ad pixels.
 *
 * Privacy rule enforced in code: only allow-listed, non-content properties pass.
 * Manuscript text, source text, titles, emails, tokens and claim tokens can
 * never ride along, even if a caller passes them by mistake.
 */
export type ChatgptEvent =
  | "preview_requested"
  | "preview_completed"
  | "preview_failed"
  | "plan_saved"
  | "save_failed"
  | "status_failed"
  | "link_started"
  | "link_completed"
  | "handoff_opened";

const ALLOWED_PROPS = new Set([
  "mode",
  "linked",
  "dscribe_model",
  "chapters",
  "warnings",
  "reason",
  "replayed",
  "latency_ms",
  "decision",
]);

export function sanitizeProps(props: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED_PROPS.has(k)) continue;
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && v.length <= 40 && /^[a-z0-9_:-]+$/i.test(v)) out[k] = v;
  }
  return out;
}

export function track(event: ChatgptEvent, props: Record<string, unknown> = {}): void {
  try {
    logger.info(`chatgpt_app.${event}`, { route: "chatgpt-app", meta: { event, ...sanitizeProps(props) } });
  } catch {
    // Analytics never breaks a tool call.
  }
}
