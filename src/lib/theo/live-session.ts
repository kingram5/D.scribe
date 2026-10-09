import type {
  MediaSessionConfig,
  InitialItem,
} from "openai/resources/live/live";
import { validateRoute } from "@/lib/ai/publisher-ready-routing";
import type { Route } from "@/lib/ai/contracts";
import { AIError } from "@/lib/ai/contracts";
import { FIDELITY } from "@/lib/publisher-ready/source-ledger";
export interface LiveFragment {
  eventId: string;
  role: "user" | "assistant";
  text: string;
  startMs: number;
  endMs: number;
}
export function appendFragment(
  events: LiveFragment[],
  event: LiveFragment,
): LiveFragment[] {
  if (events.some((e) => e.eventId === event.eventId)) return events;
  if (
    !event.eventId ||
    !Number.isFinite(event.startMs) ||
    !Number.isFinite(event.endMs) ||
    event.endMs < event.startMs ||
    !["user", "assistant"].includes(event.role) ||
    typeof event.text !== "string"
  )
    throw new AIError("malformed", "Invalid Live transcript event");
  return [...events, event];
}
export function liveConfig(
  question: string,
  history: { role: "user" | "assistant"; text: string }[],
  env: Record<string, string | undefined> = process.env,
): MediaSessionConfig {
  const input: InitialItem[] = history
    .slice(-64)
    .map(
      (m): InitialItem =>
        m.role === "user"
          ? {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: m.text }],
            }
          : {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: m.text }],
            },
    );
  while (input.reduce((n, m) => n + m.content[0].text.length, 0) > 24000)
    input.shift();
  return {
    model: env.THEO_LIVE_MODEL || "gpt-live-1",
    audio: { output: { voice: env.THEO_LIVE_VOICE || "marin" } },
    store: false,
    delegation: { type: "client" },
    client: {
      data_channel: {
        allowed_client_events: ["session.close"],
        allowed_server_events: "all",
      },
    },
    input,
    instructions: `You are T.H.E.O., Technical Human Expression Organizer. Be warm, wise, calm and attentive. Ask this author's current editorial question: ${question}\nListen without interruption; stop speaking when interrupted. Ask one concrete follow-up at a time. Delegate difficult follow-ups to the application; never treat delegation metadata as the user's words. Do not research, invent details, or answer for the author. ${FIDELITY}`,
  };
}
export function liveEnabled(
  actorId: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    env.THEO_VOICE_PROVIDER === "openai_live" &&
    (env.THEO_LIVE_ACCOUNTS ?? "")
      .split(",")
      .map((s) => s.trim())
      .includes(actorId)
  );
}
export function shouldCloseLive(
  now: number,
  created: number,
  lastClient: number,
  maxSeconds: number,
  lastSpeech: number,
): boolean {
  return (
    ![now, created, lastClient, maxSeconds, lastSpeech].every(Number.isFinite) ||
    maxSeconds <= 0 ||
    now - created >= maxSeconds * 1000 ||
    now - lastClient >= 30000 ||
    now - lastSpeech >= 90000
  );
}

export interface LiveBackendSnapshot {
  version: "mixed-v1";
  routes: { interview: Route };
  maxOperationUsd: number;
  promptVersion: "source-fidelity-v1";
}
export function resolveLiveBackend(
  env: Record<string, string | undefined> = process.env,
): LiveBackendSnapshot {
  const difficult = env.THEO_LIVE_DIFFICULT_PLANNING === "true";
  const provider = difficult ? "anthropic" : "openai";
  const model = difficult
    ? env.MIXED_DRAFT_MODEL || "claude-sonnet-5-5"
    : env.THEO_BACKEND_MODEL || "gpt-6-luna";
  let registry: Record<string, { evidence: string; price: Route["price"] }>;
  try {
    registry = JSON.parse(env.MIXED_VERIFIED_MODELS_JSON ?? "{}");
  } catch {
    throw new AIError("configuration", "Invalid model registry");
  }
  const verified = registry[`${provider}/${model}`];
  if (!verified || !env[difficult ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"])
    throw new AIError(
      "configuration",
      "Live backend access and prices need verification",
    );
  const route: Route = {
    provider,
    model,
    effort: difficult ? "high" : "low",
    timeoutMs: 45000,
    maximumAttempts: 3,
    verification: verified.evidence,
    price: verified.price,
  };
  validateRoute(route);
  const maxOperationUsd = Number(env.THEO_LIVE_BACKEND_MAX_USD);
  if (
    !Number.isFinite(maxOperationUsd) ||
    maxOperationUsd <= 0 ||
    maxOperationUsd > 100
  )
    throw new AIError(
      "configuration",
      "Set the delegated-text operation budget",
    );
  return {
    version: "mixed-v1",
    routes: { interview: route },
    maxOperationUsd,
    promptVersion: "source-fidelity-v1",
  };
}
