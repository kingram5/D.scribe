import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import OpenAI, { APIError } from "openai";
import { requireAuth } from "@/lib/auth";
import { checkInk } from "@/lib/ink";
import { logger } from "@/lib/logger";
import { createServerClient } from "@/lib/supabase";
import { brainstormProfileBlock } from "@/lib/audience-profiles";
import { checkRateLimit } from "@/lib/rate-limit";
import { ttsGateLocked } from "@/lib/topups";
import { formatResearchedSourcesBlock, rankResearchItems, type ResearchItem } from "@/lib/research-corpus";
import { sanitizeBrainstormMessages } from "@/lib/brainstorm-session";
import {
  LIVE_DEFAULT_VOICE,
  LIVE_MODEL,
  buildLiveGreetingFacts,
  buildLiveInstructions,
  firstRealUserMessage,
  isLiveVoice,
  messagesToLiveInput,
} from "@/lib/brainstorm-live";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SDP_MAX_CHARS = 256_000;

/** Bracket access so Next.js cannot inline an empty build-time value. */
function liveApiKey(): string {
  return String(process.env["OPENAI_API_KEY"] ?? "").trim();
}

function safetyIdentifier(userId: string): string {
  return createHash("sha256").update(`brainstorm-live:${userId}`).digest("hex");
}

export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "brainstorm-live", 10);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
    );
  }

  const apiKey = liveApiKey();
  if (!apiKey) {
    logger.error("Live studio missing OPENAI_API_KEY", {
      route: "/api/brainstorm/live/session",
      userId: user.id,
      meta: { vercelEnv: process.env["VERCEL_ENV"] ?? "unknown" },
    });
    return NextResponse.json(
      {
        error: "live_not_configured",
        message: "OPENAI_API_KEY is not set on this deployment. Add it to Vercel Preview (not only Production), then redeploy.",
      },
      { status: 503 },
    );
  }

  const inkCheck = await checkInk(user.id, "brainstorm_live");
  if (!inkCheck.allowed) {
    return NextResponse.json(
      { error: "out_of_ink", message: inkCheck.reason },
      { status: 402 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    sdp,
    project_id,
    messages: rawMessages,
    voice: rawVoice,
  } = (body ?? {}) as {
    sdp?: unknown;
    project_id?: unknown;
    messages?: unknown;
    voice?: unknown;
  };

  if (typeof sdp !== "string" || !sdp.trim()) {
    return NextResponse.json({ error: "An SDP offer is required" }, { status: 400 });
  }
  if (sdp.length > SDP_MAX_CHARS) {
    return NextResponse.json({ error: "SDP offer is too large" }, { status: 413 });
  }
  if (typeof project_id !== "string" || !project_id) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const voice = isLiveVoice(rawVoice) ? rawVoice : LIVE_DEFAULT_VOICE;
  const messages = sanitizeBrainstormMessages(rawMessages) ?? [];

  const supabase = createServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, title, audience, scripture_translation")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: balance } = await supabase
    .from("ink_balances")
    .select("tier, topup_tts_chars")
    .eq("user_id", user.id)
    .single();

  const tier = balance?.tier ?? "free";
  const topupTtsChars = Number(balance?.topup_tts_chars ?? 0);
  if (ttsGateLocked(tier, topupTtsChars)) {
    return NextResponse.json(
      { error: "tts_locked", message: "Voice is a Pro feature. Upgrade to unlock." },
      { status: 403 },
    );
  }

  const audienceBlock = brainstormProfileBlock(project.audience, project.scripture_translation);
  const firstUser = firstRealUserMessage(messages);
  const greeting = buildLiveGreetingFacts({
    fullName: String(user.user_metadata?.full_name || user.user_metadata?.name || ""),
    projectTitle: project.title,
    projectAudience: project.audience,
  });

  let researchBlock = "";
  const { data: researchRows } = await supabase
    .from("research_items")
    .select("id, kind, text, attribution, source_title, source_url, source_date, themes, created_at")
    .eq("project_id", project.id)
    .eq("user_id", user.id)
    .eq("status", "active");
  const recentUserText = messages
    .filter((m) => m.role === "user")
    .slice(-6)
    .map((m) => m.content)
    .join(" ");
  researchBlock = formatResearchedSourcesBlock(
    rankResearchItems((researchRows ?? []) as ResearchItem[], recentUserText),
  );

  const instructions = buildLiveInstructions({
    audienceBlock,
    greeting,
    topicAnchor: firstUser?.content ?? null,
    researchBlock,
    isResume: Boolean(firstUser),
  });

  const client = new OpenAI({ apiKey, maxRetries: 0 });

  try {
    const result = await client.live.create(
      {
        session: {
          model: LIVE_MODEL,
          instructions,
          audio: { output: { voice } },
          input: messagesToLiveInput(messages),
          delegation: { type: "client" },
        },
        transport: { type: "webrtc", sdp },
      },
      { headers: { "OpenAI-Safety-Identifier": safetyIdentifier(user.id) } },
    );

    return NextResponse.json(
      {
        session: { id: result.session.id },
        transport: { type: "webrtc", sdp: result.transport.sdp },
        opening: !firstUser,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof APIError) {
      logger.error("Live session creation failed", {
        route: "/api/brainstorm/live/session",
        userId: user.id,
        meta: { status: error.status, body: String(error.message).slice(0, 400) },
      });
      return NextResponse.json(
        {
          error: "live_openai_failed",
          message: error.status === 401 || error.status === 403
            ? "OpenAI rejected the Live API key. Confirm the key can call gpt-live-1."
            : "OpenAI could not start the Live session. Try again in a moment.",
          openai_status: error.status ?? 502,
        },
        { status: 502 },
      );
    }
    logger.error("Live session creation threw", {
      route: "/api/brainstorm/live/session",
      userId: user.id,
      error,
    });
    return NextResponse.json({ error: "Live session creation failed" }, { status: 502 });
  }
}
