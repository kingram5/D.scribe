import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkInk, recordInkUsage } from "@/lib/ink";
import { logger } from "@/lib/logger";
import { createServerClient } from "@/lib/supabase";
import { brainstormProfileBlock } from "@/lib/audience-profiles";
import {
  BRAINSTORM_INIT_PING,
  BRAINSTORM_SYSTEM_PROMPT,
  brainstormGreetingBlock,
  brainstormGreetingFacts,
  brainstormTopicAnchorBlock,
} from "@/lib/brainstorm-prompt";
import { checkRateLimit } from "@/lib/rate-limit";
import { formatResearchedSourcesBlock, rankResearchItems, type ResearchItem } from "@/lib/research-corpus";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5-20251001";

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

  const { messages, project_id } = await req.json();

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
  if (project_id) {
    const supabase = createServerClient();
    const { data: project } = await supabase
      .from("projects")
      .select("id, title, audience, scripture_translation")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();
    if (project) {
      verifiedProjectId = project.id;
      projectTitle = project.title || "";
      projectAudience = project.audience || "";
      audienceBlock = brainstormProfileBlock(project.audience, project.scripture_translation);
    }
  }

  // Build Claude messages from chat history
  const claudeMessages = messages.map((m: { role: string; content: string }) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  // Inject topic anchor: find the first real user message (not the init ping)
  const firstRealUserMsg = messages.find(
    (m: { role: string; content: string }) =>
      m.role === "user" && m.content.trim() !== BRAINSTORM_INIT_PING
  );
  const baseSystem = audienceBlock ? BRAINSTORM_SYSTEM_PROMPT + audienceBlock : BRAINSTORM_SYSTEM_PROMPT;

  // Warm opener (Kyle's note 5): the first message used to jump straight into "what are
  // we writing about", which read as rushed. On the session's opening turn only, Theo
  // greets by name and shows he already knows the project. Every fact is optional —
  // one of the accounts has no name on file, titles default to "Untitled Project",
  // and audience can be General — so the instruction lists only what actually exists.
  let greetingBlock = "";
  if (!firstRealUserMsg) {
    greetingBlock = brainstormGreetingBlock(brainstormGreetingFacts({
      fullName: String(user.user_metadata?.full_name || user.user_metadata?.name || ""),
      projectTitle,
      projectAudience,
    }));
  }

  let researchBlock = "";
  if (verifiedProjectId) {
    const supabase = createServerClient();
    const { data: researchRows } = await supabase
      .from("research_items")
      .select("id, kind, text, attribution, source_title, source_url, source_date, themes, created_at")
      .eq("project_id", verifiedProjectId)
      .eq("user_id", user.id)
      .eq("status", "active");
    const recentUserText = messages
      .filter((m: { role: string }) => m.role === "user")
      .slice(-6)
      .map((m: { content: string }) => m.content)
      .join(" ");
    researchBlock = formatResearchedSourcesBlock(
      rankResearchItems((researchRows ?? []) as ResearchItem[], recentUserText),
    );
  }

  const dynamicSystem = (firstRealUserMsg
    ? baseSystem + brainstormTopicAnchorBlock(firstRealUserMsg.content)
    : baseSystem + greetingBlock) + researchBlock;

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
      max_tokens: 512,
      temperature: 0.7,
      stream: true,
      system: dynamicSystem,
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
  let usageSettled = false;
  const settleUsage = () => {
    if (usageSettled) return;
    usageSettled = true;
    if (inputTokens > 0 || outputTokens > 0) {
      recordInkUsage(user.id, verifiedProjectId, "brainstorm", "fast", { input_tokens: inputTokens, output_tokens: outputTokens }).catch((err) => logger.error("recordInkUsage failed", { route: "/api/brainstorm", userId: user.id, error: err }));
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
