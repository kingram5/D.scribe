import { readLiveTranscripts } from "../src/lib/theo/live-events";
/** Dedicated long-running service; NOT a Next/Vercel request or browser timer. */
import { randomUUID } from "node:crypto";
import { SidebandWS } from "openai/resources/live/sideband/ws";
import type { ConnectServerEvent } from "openai/resources/live/sideband/sideband";
import { HttpsProxyAgent } from "https-proxy-agent";
import { createServerClient } from "../src/lib/supabase";
import { openAIClient } from "../src/lib/ai/openai";
import { liveConfig, THEO_LIVE_PROMPT } from "../src/lib/theo/live-config";
import {
  transcriptText,
  safeVendorLifetime,
  type TranscriptEvent,
} from "../src/lib/theo/live-transcript";
import { serveNext, submitAnswer } from "../src/lib/publisher-ready/interview";
import { welcomeLine, nextLine } from "../src/lib/publisher-ready/room-lines";

const db = createServerClient();
const client = openAIClient();
const workerId = randomUUID();
const active = new Map<
  string,
  { ws: SidebandWS; vendorId: string; close: () => void }
>();
let stopping = false;
let ticking = false;
type Session = {
  id: string;
  user_id: string;
  run_id: string;
  offer: string;
  reserved_seconds: number;
  created_at: string;
  vendor_session_id: string | null;
  last_answer_ms: number;
  follow_up_of: string | null;
  end_requested: boolean;
};
async function update(id: string, patch: Record<string, unknown>) {
  const { error } = await db
    .from("theo_live_sessions")
    .update(patch)
    .eq("id", id)
    .eq("worker_id", workerId)
    .neq("state", "closed");
  if (error) throw new Error("Live session persistence failed");
}
async function delegate(
  s: Session,
  event: Extract<ConnectServerEvent, { type: "session.delegation.created" }>,
  ws: SidebandWS,
) {
  if (event.delegation.target !== "client") return;
  const { data: currentSession } = await db
    .from("theo_live_sessions")
    .select("last_answer_ms,follow_up_of,end_requested,state,worker_id")
    .eq("id", s.id)
    .single();
  const rows = (await readLiveTranscripts(s.id)).filter(
    (r) => r.event_type === "session.input_transcript.delta",
  );
  if (!currentSession) throw new Error("Live transcript unavailable");
  if (
    currentSession.end_requested ||
    currentSession.state !== "active" ||
    currentSession.worker_id !== workerId
  )
    return;
  // SDK delegation has no utterance. Assemble persisted source fragments at its boundary.
  const answer = transcriptText(
    (rows ?? []).map((r) => r.payload as TranscriptEvent),
    Number(currentSession.last_answer_ms),
    event.offset_ms,
  ).trim();
  if (!answer) return;
  if (answer.length > 8000) {
    ws.send({
      type: "session.commentary.append",
      delegation_id: event.delegation.id,
      content:
        "Please finish this answer in the text box so we can keep all of your words.",
    });
    return;
  }
  const { data: q } = await db
    .from("pr_questions")
    .select("id")
    .eq("run_id", s.run_id)
    .eq("status", "asked")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!q) return;
  const result = await submitAnswer({
    userId: s.user_id,
    runId: s.run_id,
    questionId: q.id,
    transcript: answer,
    source: "voice",
    followUpOf: currentSession.follow_up_of,
    sourceEventKey: `${s.id}:${event.delegation.id}`,
  });
  await update(s.id, {
    last_answer_ms: event.offset_ms,
    follow_up_of: result.followUp ? result.answerId : null,
  });
  let line = result.followUp;
  if (!line) {
    const state = await serveNext(s.user_id, s.run_id);
    line = nextLine(state.next, state.progress.answered);
  }
  ws.send({
    type: "session.commentary.append",
    delegation_id: event.delegation.id,
    content: line.slice(0, 1600),
  });
}
async function attach(
  s: Session,
  vendorId: string,
  answer: string | null,
  expiresAt: number,
  startedAt: number,
  recovery = false,
) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const ws = new SidebandWS(
    client,
    { session_id: vendorId, graceful_close: true },
    {
      ...(proxy ? { agent: new HttpsProxyAgent(proxy) } : {}),
      reconnect: { maxRetries: 3, onReconnecting: () => {} },
    },
  );
  let serial = Promise.resolve();
  let closeRequested = false;
  let lastInput = Date.now();
  const close = () => {
    closeRequested = true;
    ws.send({ type: "session.close" });
  };
  active.set(s.id, { ws, vendorId, close });
  const readyTimeout = setTimeout(() => {
    close();
    void update(s.id, {
      state: "reconciliation",
      failure: "Live sideband did not become ready; final usage pending.",
    });
  }, 10000);
  ws.on("error", () => {
    close();
    void update(s.id, {
      state: "reconciliation",
      failure: "Live control connection failed; final usage pending.",
    }).catch(() => {});
  });
  ws.on("close", () => {
    clearTimeout(readyTimeout);
    active.delete(s.id);
    void db
      .from("theo_live_sessions")
      .update({
        state: "reconciliation",
        failure: "Connection closed without confirmed final usage.",
      })
      .eq("id", s.id)
      .eq("worker_id", workerId)
      .neq("state", "closed")
      .then(() => {});
  });
  ws.on("event", (event) => {
    serial = serial
      .then(async () => {
        const seconds =
          event.type === "session.usage.updated" ||
          event.type === "session.closed"
            ? event.usage.seconds
            : null;
        const { data: fresh, error } = await db.rpc("theo_live_observe", {
          p_id: s.id,
          p_event_id: event.event_id,
          p_type: event.type,
          p_event: event,
          p_seconds: seconds,
          p_closed: event.type === "session.closed",
        });
        if (error) throw new Error("Live event persistence failed");
        if (!fresh) return;
        if (event.type === "session.started") {
          clearTimeout(readyTimeout);
          expiresAt = event.session.expires_at;
          await update(s.id, {
            vendor_expires_at: new Date(expiresAt * 1000).toISOString(),
          });
          if (
            recovery ||
            !safeVendorLifetime(expiresAt, startedAt, s.reserved_seconds)
          ) {
            await update(s.id, {
              state: "closing",
              failure: recovery
                ? "Recovered session is closing; continue with a new session."
                : "This session duration exceeds your remaining allowance. Continue typing.",
            });
            close();
            return;
          }
          const { data: current } = await db
            .from("theo_live_sessions")
            .select("end_requested,worker_id")
            .eq("id", s.id)
            .single();
          if (
            !current ||
            current.end_requested ||
            current.worker_id !== workerId
          ) {
            close();
            return;
          }
          const state = await serveNext(s.user_id, s.run_id);
          if (!state.next) {
            close();
            return;
          }
          ws.send({
            type: "session.commentary.append",
            delegation_id: null,
            content: welcomeLine(state.next, state.progress.answered).slice(
              0,
              1600,
            ),
          });
          await update(s.id, {
            state: "active",
            answer,
            offer: null,
            vendor_expires_at: new Date(expiresAt * 1000).toISOString(),
          });
        }
        if (event.type === "session.input_transcript.delta")
          lastInput = Date.now();
        if (event.type === "session.delegation.created" && !closeRequested)
          await delegate(s, event, ws);
        if (seconds !== null && seconds >= s.reserved_seconds - 5) close();
        if (event.type === "session.closed") {
          clearInterval(monitor);
          active.delete(s.id);
          ws.close();
        }
      })
      .catch(async () => {
        close();
        await update(s.id, {
          state: "reconciliation",
          failure:
            "Voice was interrupted. Saved transcript fragments are retained; continue typing.",
        }).catch(() => {});
      });
  });
  const monitor = setInterval(() => {
    void (async () => {
      const { data: state, error } = await db
        .from("theo_live_sessions")
        .select("end_requested,client_seen_at,state,worker_id")
        .eq("id", s.id)
        .single();
      if (error || !state) {
        close();
        return;
      }
      if (state.state === "closed" || state.worker_id !== workerId) {
        clearInterval(monitor);
        ws.close();
        return;
      }
      await update(s.id, { worker_seen_at: new Date().toISOString() });
      if (
        stopping ||
        state.end_requested ||
        Date.now() - Date.parse(state.client_seen_at) > 30000 ||
        Date.now() - lastInput > 120000 ||
        Date.now() >= expiresAt * 1000 - 5000 ||
        !liveConfig(s.user_id)
      )
        close();
    })().catch(() => close());
  }, 2000);
  ws.on("close", () => clearInterval(monitor));
}
async function start(s: Session) {
  const config = liveConfig(s.user_id);
  if (!config || s.end_requested) {
    await update(s.id, {
      state: "closed",
      offer: null,
      failure: "Live voice disabled before creation.",
    });
    return;
  }
  const startedAt = Date.now();
  try {
    const result = await client.live.create({
      session: {
        model: config.model,
        delegation: { type: "client" },
        instructions: THEO_LIVE_PROMPT,
        audio: { output: { voice: config.voice } },
        store: false,
        client: {
          data_channel: {
            allowed_client_events: ["session.close"],
            allowed_server_events: "all",
          },
        },
      },
      transport: { type: "webrtc", sdp: s.offer },
    });
    await update(s.id, {
      vendor_session_id: result.session.id,
      worker_seen_at: new Date().toISOString(),
    });
    await attach(
      s,
      result.session.id,
      result.transport.sdp,
      Infinity,
      startedAt,
    );
  } catch {
    await update(s.id, {
      state: "reconciliation",
      failure:
        "Session creation was interrupted; allowance is held until reconciled.",
    });
  }
}
async function tick() {
  if (ticking || stopping) return;
  ticking = true;
  try {
    const heartbeat = await db
      .from("theo_live_workers")
      .upsert({ id: workerId, heartbeat_at: new Date().toISOString() });
    if (heartbeat.error) throw new Error("Worker heartbeat failed");
    const { data, error } = await db.rpc("theo_live_claim", {
      p_worker: workerId,
    });
    if (error) throw new Error("Live worker migration is unavailable");
    for (const s of data ?? []) void start(s as Session).catch(() => {});
    // Reattach stale sessions solely to close/reconcile them, never replay a turn.
    const { data: stale } = await db
      .from("theo_live_sessions")
      .select("*")
      .in("state", ["creating", "active", "closing", "reconciliation"])
      .lt("worker_seen_at", new Date(Date.now() - 30000).toISOString())
      .not("vendor_session_id", "is", null)
      .limit(5);
    for (const s of stale ?? []) {
      if (active.has(s.id)) continue;
      const claimed = await db
        .from("theo_live_sessions")
        .update({
          worker_id: workerId,
          worker_seen_at: new Date().toISOString(),
        })
        .eq("id", s.id)
        .eq("worker_seen_at", s.worker_seen_at)
        .select("id");
      if (claimed.data?.length)
        await attach(
          s as Session,
          s.vendor_session_id,
          null,
          Date.parse(s.vendor_expires_at) / 1000,
          Date.parse(s.created_at),
          true,
        );
    }
  } finally {
    ticking = false;
  }
}
for (const sig of ["SIGTERM", "SIGINT"] as const)
  process.on(sig, () => {
    stopping = true;
    for (const s of active.values()) s.close();
    setTimeout(() => process.exit(0), 10000).unref();
  });
console.log(
  "Theo Live staging worker starting; no session is purchased until an authorized request is queued.",
);
setInterval(
  () =>
    void tick().catch((e) =>
      console.error(e instanceof Error ? e.message : "Worker failed"),
    ),
  2000,
);
void tick().catch((e) => {
  console.error(e instanceof Error ? e.message : "Worker failed");
  process.exitCode = 1;
});
