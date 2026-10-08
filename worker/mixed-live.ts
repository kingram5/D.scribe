/** Persistent supervisor, never a serverless request timer. See docs/mixed-stack-rollout.md. */
import { createServer } from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import OpenAI from "openai";
import { SidebandWS } from "openai/resources/live/sideband/ws";
import { HttpsProxyAgent } from "https-proxy-agent";
import { createServerClient } from "../src/lib/supabase";
import {
  liveConfig,
  liveEnabled,
  shouldCloseLive,
  resolveLiveBackend,
} from "../src/lib/theo/live-session";
import { delegateLive } from "../src/lib/theo/live-delegation";

const token = process.env.THEO_LIVE_SUPERVISOR_TOKEN;
if (!token || token.length < 32)
  throw new Error("A supervisor token of at least 32 characters is required");
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0,
  timeout: 20000,
});
const db = createServerClient();
const workerId = randomUUID();
const sessions = new Map<string, { socket: SidebandWS; closing: boolean }>();
const proxy = process.env.HTTPS_PROXY;
const auth = (value: string | undefined) => {
  const a = Buffer.from(value ?? ""),
    b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
};
async function update(id: string, fields: Record<string, unknown>) {
  const { error } = await db
    .from("theo_live_sessions")
    .update(fields)
    .eq("id", id);
  if (error) throw error;
}
async function monitor(id: string, vendorId: string, recovery = false) {
  if (sessions.has(id)) return;
  const socket = new SidebandWS(
    client,
    { session_id: vendorId },
    {
      reconnect: {
        maxRetries: 3,
        onReconnecting: () => {
          state.closing = true;
        },
      },
      ...(proxy ? { agent: new HttpsProxyAgent(proxy) } : {}),
    },
  );
  const state = { socket, closing: recovery };
  sessions.set(id, state);
  let delegating = false;
  let lastSpeech = Date.now();
  let final = false;
  let closingAt = 0;
  let tickBusy = false;
  const close = () => {
    state.closing = true;
    closingAt ||= Date.now();
    socket.send({ type: "session.close" });
  };
  const tick = setInterval(() => {
    if (tickBusy) return;
    tickBusy = true;
    void (async () => {
      const { data: s, error } = await db
        .from("theo_live_sessions")
        .select("*")
        .eq("id", id)
        .single();
      if (error || !s) throw new Error("Session storage unavailable");
      await update(id, {
        worker_id: workerId,
        worker_lease_until: new Date(Date.now() + 15000).toISOString(),
      });
      if (
        state.closing ||
        shouldCloseLive(
          Date.now(),
          Date.parse(s.created_at),
          Date.parse(s.client_seen_at),
          s.max_seconds,
          delegating ? Date.now() : lastSpeech,
        )
      )
        close();
      if (closingAt && Date.now() - closingAt > 20000) {
        await update(id, { state: "reconcile" });
        socket.close();
      }
    })()
      .catch(() => {
        close();
      })
      .finally(() => {
        tickBusy = false;
      });
  }, 2000);
  try {
    for await (const record of socket.stream({ maxBufferedEvents: 1024 })) {
      if (record.type === "open") {
        if (recovery) close();
        continue;
      }
      if (record.type !== "message") continue;
      const event = record.message;
      if (
        event.type === "session.input_transcript.delta" ||
        event.type === "session.output_transcript.delta"
      ) {
        const role =
          event.type === "session.input_transcript.delta"
            ? "user"
            : "assistant";
        lastSpeech = Date.now();
        const { error } = await db.from("theo_live_events").upsert(
          {
            session_id: id,
            event_id: event.event_id,
            role,
            text: event.delta,
            start_ms: event.start_ms,
            end_ms: event.end_ms,
          },
          { onConflict: "session_id,event_id", ignoreDuplicates: true },
        );
        if (error) throw error;
      } else if (
        event.type === "session.delegation.created" &&
        !state.closing &&
        !delegating
      ) {
        // Queue no more than one backend task at a time; event loop must continue saving transcript and usage.
        const { data: s, error } = await db
          .from("theo_live_sessions")
          .select("*")
          .eq("id", id)
          .single();
        if (error || !s) throw new Error("Session unavailable");
        delegating = true;
        void delegateLive(s, event.delegation.id)
          .then((content) => {
            if (!state.closing)
              socket.send({
                type: "session.thinking.append",
                delegation_id: event.delegation.id,
                content,
              });
          })
          .catch(() => close())
          .finally(() => {
            delegating = false;
          });
      } else if (event.type === "session.closed") {
        const { error } = await db.rpc("settle_theo_live", {
          p_session_id: id,
          p_usage: event.usage,
        });
        if (error) throw error;
        final = true;
        break;
      }
    }
  } catch {
    // A database/sideband failure must request vendor closure, not just mute audio.
    try {
      close();
    } catch {
      /* Recovery will reattach using the persisted vendor ID. */
    }
    await update(id, { state: "reconcile" }).catch(() => {});
  } finally {
    clearInterval(tick);
    socket.close();
    sessions.delete(id);
    if (!final) await update(id, { state: "reconcile" }).catch(() => {});
  }
}
async function start(actorId: string, runId: string, sdp: string) {
  if (!liveEnabled(actorId) || !process.env.THEO_LIVE_CAPABILITY_VERIFICATION)
    throw new Error("Live route is disabled or unverified");
  if (typeof sdp !== "string" || sdp.length > 256000 || !sdp.startsWith("v=0"))
    throw new Error("Invalid SDP");
  const { data: run, error } = await db
    .from("pr_runs")
    .select("models,project_id")
    .eq("id", runId)
    .eq("user_id", actorId)
    .single();
  if (error || !run) throw new Error("Owned Publisher-Ready run required");
  const backend = resolveLiveBackend();
  const { data: q, error: qe } = await db
    .from("pr_questions")
    .select("id,question")
    .eq("run_id", runId)
    .eq("status", "asked")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  if (qe || !q)
    throw new Error("Serve an editorial question before starting Live");
  const price = JSON.parse(process.env.THEO_LIVE_VERIFIED_PRICE_JSON ?? "{}");
  if (
    !price.version ||
    !price.source?.startsWith("https://") ||
    !Number.isFinite(Date.parse(price.verifiedAt)) ||
    typeof price.usdPerMinute !== "number" ||
    !Number.isFinite(price.usdPerMinute) ||
    price.usdPerMinute < 0
  )
    throw new Error("Verified Live pricing required");
  const seconds = Number(process.env.THEO_LIVE_MAX_SECONDS ?? 300);
  const { data: s, error: reserve } = await db.rpc("reserve_theo_live", {
    p_user_id: actorId,
    p_run_id: runId,
    p_question_id: q.id,
    p_seconds: seconds,
    p_price: price,
    p_backend: backend,
  });
  if (reserve || !s) throw new Error("Live quota reservation unavailable");
  let vendorId: string | undefined;
  try {
    const { data: answers, error: ae } = await db
      .from("pr_answers")
      .select("transcript")
      .eq("run_id", runId)
      .eq("question_id", q.id)
      .order("created_at");
    if (ae) throw ae;
    const response = await client.live.create({
      session: liveConfig(
        q.question,
        (answers ?? []).map((a) => ({ role: "user", text: a.transcript })),
      ),
      transport: { type: "webrtc", sdp },
    });
    vendorId = response.session.id;
    await update(s.id, {
      vendor_id: vendorId,
      state: "active",
      worker_id: workerId,
      worker_lease_until: new Date(Date.now() + 15000).toISOString(),
    });
    void monitor(s.id, response.session.id).catch(() => {});
    return {
      id: s.id,
      sdp: response.transport.sdp,
      maxSeconds: seconds,
      questionId: q.id,
    };
  } catch {
    await update(s.id, {
      state: "reconcile",
      ...(vendorId
        ? { vendor_id: vendorId, worker_lease_until: new Date().toISOString() }
        : {}),
    }).catch(() => {});
    // Creation succeeded but persistence/SDP delivery failed: close the known paid session.
    if (vendorId) void monitor(s.id, vendorId, true).catch(() => {});
    throw new Error(
      "Live startup requires reconciliation; do not retry blindly",
    );
  }
}
// Recover orphaned vendor sessions on restart; never create a second vendor session.
let recovering = false;
const recovery = setInterval(() => {
  if (recovering) return;
  recovering = true;
  void (async () => {
    const { data, error } = await db
      .from("theo_live_sessions")
      .select("id,vendor_id")
      .neq("state", "closed")
      .lt("worker_lease_until", new Date().toISOString());
    if (error) throw error;
    for (const s of data ?? [])
      if (s.vendor_id && !sessions.has(s.id)) {
        const { data: claimed, error } = await db
          .from("theo_live_sessions")
          .update({
            worker_id: workerId,
            worker_lease_until: new Date(Date.now() + 15000).toISOString(),
          })
          .eq("id", s.id)
          .lt("worker_lease_until", new Date().toISOString())
          .select("id");
        if (!error && claimed?.length)
          void monitor(s.id, s.vendor_id, true).catch(() => {});
      }
  })()
    .catch(() => {
      console.error("Live recovery storage unavailable");
    })
    .finally(() => {
      recovering = false;
    });
}, 5000);
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (!auth(req.headers.authorization)) {
    res.writeHead(401).end('{"error":"Unauthorized"}');
    return;
  }
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 300000) throw new Error("Request too large");
    }
    const input = JSON.parse(body || "{}");
    if (req.url === "/start")
      res.end(
        JSON.stringify(await start(input.actorId, input.runId, input.sdp)),
      );
    else {
      const { data: s, error } = await db
        .from("theo_live_sessions")
        .select("*")
        .eq("id", input.id)
        .eq("user_id", input.actorId)
        .eq("run_id", input.runId)
        .single();
      if (error || !s) throw new Error("Session unavailable");
      if (req.url === "/pulse" && s.state !== "closed")
        await update(s.id, { client_seen_at: new Date().toISOString() });
      if (req.url === "/stop" && s.state !== "closed") {
        const current = sessions.get(s.id);
        if (current) {
          current.closing = true;
          current.socket.send({ type: "session.close" });
        } else if (s.vendor_id)
          void monitor(s.id, s.vendor_id, true).catch(() => {});
      }
      res.end(JSON.stringify({ state: s.state, answerId: s.answer_id }));
    }
  } catch {
    res
      .writeHead(409)
      .end(
        '{"error":"Live operation unavailable; use typed continuation or request reconciliation."}',
      );
  }
});
server.listen(
  Number(process.env.THEO_LIVE_SUPERVISOR_PORT ?? 3003),
  process.env.THEO_LIVE_SUPERVISOR_HOST ?? "127.0.0.1",
);
process.on("SIGTERM", () => {
  clearInterval(recovery);
  server.close();
  for (const s of sessions.values()) {
    s.closing = true;
    s.socket.send({ type: "session.close" });
  }
  setTimeout(() => process.exit(0), 25000).unref();
});
