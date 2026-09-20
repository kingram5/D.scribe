import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkInk, recordInkUsage } from "@/lib/ink";
import { logger } from "@/lib/logger";
import { createServerClient } from "@/lib/supabase";
import { brainstormProfileBlock } from "@/lib/audience-profiles";
import { checkRateLimit } from "@/lib/rate-limit";
import { formatResearchedSourcesBlock, rankResearchItems, type ResearchItem } from "@/lib/research-corpus";
import { buildBriefingBlock, loadBriefingData } from "@/lib/brainstorm-briefing";
import { THEO_SYSTEM_PROMPT, THEO_GENERIC_OPENER } from "@/lib/theo/craft";
import { ledgerGaps } from "@/lib/theo/ingredients";
import {
  INIT_PING, askedQuestions, authorTurns, buildNotesBlock, callbackAllowed, computePacing,
  landingDeclinedAt, personalNormFrom, readNotes, stripPrivateTags, wrapPrivate,
} from "@/lib/theo/notes";
import { sanitizeBrainstormMessages, type BrainstormMessage } from "@/lib/brainstorm-session";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
// The interviewer is the flagship conversation: it runs on the quality tier
// (claude-lite.ts MODELS.quality), not the fast tier it used to share with
// one-shot utility calls. Depth here is the product.
const MODEL = "claude-sonnet-4-6";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "brainstorm", 30);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Too many requests. Please wait before trying again." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
    });
  }

  // Pre-flight Ink check
  const inkCheck = await checkInk(user.id, "brainstorm");
  if (!inkCheck.allowed) {
    return new Response(
      JSON.stringify({ error: "out_of_ink", message: inkCheck.reason }),
      { status: 402, headers: { "Content-Type": "application/json" } }
    );
  }

  const { messages, project_id, primer } = await req.json();
  // Optional "anything you want me to read first?" text. First turn only, capped.
  const primerText = typeof primer === "string" ? stripPrivateTags(primer).replace(/\s+/g, " ").trim().slice(0, 4000) : "";

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "messages array required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Audience specialization: load the project's audience server-side (never trust a
  // client-supplied audience). Missing/foreign project_id degrades to the generic
  // interviewer rather than erroring — older clients don't send project_id at all.
  let verifiedProjectId: string | null = null;
  let audienceBlock: string | null = null;
  let projectTitle = "";
  let projectAudience = "";
  let projectTopic = "";
  if (project_id) {
    const supabase = createServerClient();
    const { data: project } = await supabase
      .from("projects")
      .select("id, title, audience, scripture_translation, brainstorm_topic")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();
    if (project) {
      verifiedProjectId = project.id;
      projectTitle = project.title || "";
      projectAudience = project.audience || "";
      projectTopic = String((project as { brainstorm_topic?: string | null }).brainstorm_topic || "").trim();
      audienceBlock = brainstormProfileBlock(project.audience, project.scripture_translation);
    }
  }

  // The conversation, with anything that looks like a private block removed:
  // an author cannot smuggle instructions to Theo through the chat box.
  const history: BrainstormMessage[] = messages
    .filter((m: { role?: unknown; content?: unknown }) => typeof m?.content === "string")
    .map((m: { role: string; content: string }) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.role === "user" ? stripPrivateTags(m.content) : m.content,
    }));

  const firstRealUserMsg = history.find((m) => m.role === "user" && m.content.trim() !== INIT_PING);
  const spoken = authorTurns(history);

  // Homework, continuity, Theo's notebook and this author's usual session
  // length. Every read degrades to empty: a brainstorm must never 500 because
  // its background material failed to load.
  let briefing: Awaited<ReturnType<typeof loadBriefingData>> = { keyPoints: [], transcripts: [], handoffs: [], thinChapters: [], pastSessions: [] };
  let notes = readNotes(null);
  let storedMessages: BrainstormMessage[] = [];
  let personalNorm: number | null = null;
  let researchBlock = "";
  if (verifiedProjectId) {
    const supabase = createServerClient();
    const [briefingData, activeRes, normRes, researchRes] = await Promise.all([
      loadBriefingData(supabase, verifiedProjectId, user.id),
      supabase.from("brainstorm_sessions").select("notes, messages").eq("project_id", verifiedProjectId).eq("user_id", user.id).eq("status", "active").maybeSingle(),
      supabase.from("brainstorm_sessions").select("turn_count").eq("user_id", user.id).eq("status", "finished").order("updated_at", { ascending: false }).limit(12),
      supabase.from("research_items").select("id, kind, text, attribution, source_title, source_url, source_date, themes, created_at").eq("project_id", verifiedProjectId).eq("user_id", user.id).eq("status", "active"),
    ]);
    briefing = briefingData;
    notes = readNotes((activeRes.data as { notes?: unknown } | null)?.notes);
    storedMessages = sanitizeBrainstormMessages((activeRes.data as { messages?: unknown } | null)?.messages) ?? [];
    personalNorm = personalNormFrom(((normRes.data ?? []) as { turn_count: number }[]).map((r) => r.turn_count));
    researchBlock = formatResearchedSourcesBlock(
      rankResearchItems((researchRes.data ?? []) as ResearchItem[], spoken.slice(-6).join(" ")),
    );
  }

  // The studio sends Claude a WINDOW (opening exchange plus the last 8 messages)
  // to keep turns cheap. Everything counted in code (pacing against the author's
  // own baseline, the callback budget, landing offers) needs the WHOLE session,
  // so rebuild it from the autosaved row plus the turn that just arrived.
  const lastTurn = history[history.length - 1];
  const session: BrainstormMessage[] =
    storedMessages.length > history.length && lastTurn?.role === "user"
      ? [...storedMessages.filter((m, i) => !(i === storedMessages.length - 1 && m.role === "user" && m.content === lastTurn.content)), lastTurn]
      : history;
  const sessionSpoken = authorTurns(session);

  // TOPIC ANCHOR. The stored topic wins, then a real title. Only a project with
  // neither falls back to the first thing the author typed, and never to a
  // returning author's "let's pick up where we left off".
  const knownTitle = projectTitle && !/^untitled/i.test(projectTitle) ? projectTitle : "";
  const returning = (briefing.handoffs?.length ?? 0) > 0 || briefing.transcripts.some((t) => (t.authorLines?.length ?? 0) > 0);
  const anchorText = projectTopic || knownTitle || (!returning && firstRealUserMsg ? firstRealUserMsg.content.slice(0, 200) : "");
  const anchorBlock = anchorText
    ? `\n\nTOPIC ANCHOR. This book is about: ${JSON.stringify(anchorText)}\nEvery question stays rooted in that subject. When a sub-topic surfaces, explore it as an angle within this book, then return to the broader theme.`
    : "";

  // STABLE system text: identical on every turn of a project, so it caches.
  const stableSystem = THEO_SYSTEM_PROMPT + (audienceBlock ?? `\n\n${THEO_GENERIC_OPENER}`) + anchorBlock;

  // Warm opener (Kyle's note 5): on the opening turn only, Theo greets by name
  // and shows he already knows the project. Every fact is optional.
  let greetingBlock = "";
  if (!firstRealUserMsg) {
    const rawName = String(user.user_metadata?.full_name || user.user_metadata?.name || "").trim();
    const firstName = rawName ? (rawName.split(/\s+/)[0] ?? "") : "";
    const knownAudience = projectAudience && projectAudience !== "General" ? projectAudience : "";
    const known: string[] = [];
    if (firstName) known.push(`The author's first name is ${JSON.stringify(firstName)}. Greet them by it.`);
    if (knownTitle) known.push(`Their working title is ${JSON.stringify(knownTitle)}. Mention it naturally.`);
    if (knownAudience) known.push(`The book is aimed at a ${JSON.stringify(knownAudience)} audience. Acknowledge that.`);
    const handoff = briefing.handoffs?.[0];
    const priorAnswers = briefing.transcripts.flatMap((t) => t.authorLines ?? []).slice(0, 2);
    if (handoff?.line || handoff?.nextQuestion) {
      // A returning author never gets a cold restart. This greeting is the one
      // guaranteed callback; after it, callbacks are rationed in the notes block.
      known.push(
        `The author has brainstormed this book before.${handoff.line ? ` Their strongest line last time: ${JSON.stringify(handoff.line.slice(0, 200))}.` : ""}${handoff.nextQuestion ? ` You left them with this question to think about: ${JSON.stringify(handoff.nextQuestion.slice(0, 200))}.` : ""} Open by quoting that line back naturally, then either ask what came to them about that question, or ask where they want to pick up. Do NOT ask what the book is about from scratch.`,
      );
    } else if (priorAnswers.length > 0) {
      known.push(
        `The author has brainstormed on this project before. Their own words last time: ${priorAnswers.map((a) => JSON.stringify(a.slice(0, 140))).join(", ")}. Open by acknowledging that, quote one of those lines naturally, and ask where they want to pick up or what has changed since. Do NOT ask what the book is about from scratch.`,
      );
    }
    if (primerText) {
      known.push(
        `Before starting, the author shared this to read first (notes, an outline, or a passage). Read it as background. Your first question should show you read it by asking about ONE specific thing in it, and asking for the moment or the room it came from:\n${JSON.stringify(primerText)}`,
      );
    }
    greetingBlock = `OPENING GREETING. This is the very first message of the session. Open warmly as Theo, in one or two sentences, before your first question: introduce yourself briefly and show you already know this project.\n${known.length ? known.join("\n") : "Nothing about the author or project is on file yet. Keep the greeting warm and generic."}\nThen ask your single opening question. Never invent a name, title, or audience that is not listed above.`;
  }

  // VOLATILE per-turn material rides at the END of the final user turn, inside
  // private tags, so the system text and the history before it stay byte-stable
  // and cacheable. Nothing in here is ever stored in the conversation.
  const pacing = computePacing({ messages: session, personalNorm, landingDeclinedAtTurn: landingDeclinedAt(session) });
  const notesBlock = firstRealUserMsg
    ? buildNotesBlock({
        notes,
        pacing,
        callbackOk: callbackAllowed(session),
        alreadyAsked: askedQuestions(briefing.pastSessions ?? []),
        gaps: sessionSpoken.length >= 3 ? ledgerGaps(projectAudience, notes.captured).map((g) => g.need) : [],
      })
    : "";
  const digestBlock = buildBriefingBlock(briefing, spoken.slice(-2).join(" "));
  const privateBlock = wrapPrivate([greetingBlock, notesBlock, digestBlock, researchBlock]);

  // Claude messages. Only the stable system text carries a cache breakpoint: the
  // history is a sliding window, so a breakpoint on it would pay the cache-write
  // premium for a prefix that is never read again.
  const lastUserIdx = history.map((m) => m.role).lastIndexOf("user");
  const claudeMessages = history.map((m, i) => ({
    role: m.role,
    content: i === lastUserIdx && privateBlock
      ? [{ type: "text" as const, text: m.content }, { type: "text" as const, text: privateBlock }]
      : m.content,
  }));

  // Abort the upstream call if the client walks away — otherwise Anthropic
  // keeps generating to completion and we pay for tokens nobody will read.
  const upstreamAbort = new AbortController();

  const res = await fetch(API_URL, {
    method: "POST",
    signal: upstreamAbort.signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 900,
      temperature: 0.7,
      stream: true,
      // Authors pause for minutes between answers, so the 1-hour cache is the
      // one that actually gets hit.
      system: [{ type: "text", text: stableSystem, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: claudeMessages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error(`Claude API ${res.status} in brainstorm`, {
      route: "/api/brainstorm",
      userId: user.id,
      meta: { status: res.status, body: err.slice(0, 500) },
    });
    return new Response(JSON.stringify({ error: `Claude API ${res.status}: ${err.slice(0, 200)}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Stream the response
  const encoder = new TextEncoder();
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let usageSettled = false;
  const settleUsage = () => {
    if (usageSettled) return;
    usageSettled = true;
    if (inputTokens > 0 || outputTokens > 0 || cacheReadTokens > 0 || cacheWriteTokens > 0) {
      recordInkUsage(user.id, verifiedProjectId, "brainstorm", "quality", { input_tokens: inputTokens, output_tokens: outputTokens, cache_read_input_tokens: cacheReadTokens, cache_creation_input_tokens: cacheWriteTokens }).catch((err) => logger.error("recordInkUsage failed", { route: "/api/brainstorm", userId: user.id, error: err }));
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);
              if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                // Deltas stream RAW. Sanitizing per-delta trimmed the leading
                // space off every token boundary — word-fused text client-side
                // and killed the TTS sentence splitter with it. The system
                // prompt is the tell-guard for chat; the output sanitizer is
                // for assembled chapter prose only.
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
              }
              if (event.type === "message_start" && event.message?.usage) {
                inputTokens = event.message.usage.input_tokens || 0;
                cacheReadTokens = event.message.usage.cache_read_input_tokens || 0;
                cacheWriteTokens = event.message.usage.cache_creation_input_tokens || 0;
              }
              if (event.type === "message_delta" && event.usage) {
                outputTokens = event.usage.output_tokens || 0;
              }
            } catch {
              // skip malformed
            }
          }
        }
        settleUsage();
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        logger.error("Brainstorm stream error", {
          route: "/api/brainstorm",
          userId: user.id,
          error: err,
        });
        settleUsage();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
    cancel() {
      // Client walked away — stop paying for tokens nobody will read, and
      // settle whatever usage already streamed.
      upstreamAbort.abort();
      reader.cancel().catch(() => {});
      settleUsage();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
