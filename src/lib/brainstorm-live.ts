/**
 * GPT-Live-1 brainstorm studio helpers. Keep this module free of I/O so tests
 * can cover prompt, history, transcript grouping, and Ink duration math.
 */

import type { BrainstormMessage } from "@/lib/brainstorm-session";
import { INK_PER_LIVE_MINUTE } from "@/lib/ink";
import type { ResearchItem } from "@/lib/research-corpus";
import { formatResearchedSourcesBlock, rankResearchItems } from "@/lib/research-corpus";

export const LIVE_MODEL = "gpt-live-1";
export const LIVE_DEFAULT_VOICE = "meridian";
export const LIVE_VOICES = ["meridian", "ballad", "gleam", "vesper", "willow", "marin", "ripple"] as const;
export type LiveVoice = (typeof LIVE_VOICES)[number];

export const LIVE_INIT_PING = "Start the brainstorm session.";
export const LIVE_MAX_HISTORY_MESSAGES = 128;
export const LIVE_MAX_HISTORY_TOKENS = 8192;
export const LIVE_APPEND_MAX_CHARS = 1800; // ~450 tokens, under the 500-token append cap
export const LIVE_MAX_SESSION_SECONDS = 60 * 60;
export const LIVE_TRANSCRIPT_GAP_MS = 1500;
/** Place resumed turns well before Live's 0ms clock so captions cannot merge into history. */
export const LIVE_SEED_FRAGMENT_GAP_MS = 10_000;
export const LIVE_SEED_FRAGMENT_END_MS = -60_000;

/** Opening-greeting facts the Live model may mention, never invent. */
export type LiveGreetingFacts = {
  firstName: string;
  title: string;
  audience: string;
};

export type LiveTranscriptFragment = {
  speaker: "user" | "assistant";
  delta: string;
  start_ms: number;
  end_ms: number;
};

export type LiveHistoryItem =
  | {
      type: "message";
      role: "user";
      content: Array<{ type: "input_text"; text: string }>;
    }
  | {
      type: "message";
      role: "assistant";
      content: Array<{ type: "output_text"; text: string }>;
    };

const LIVE_INSTRUCTIONS = `You are T.H.E.O, called Theo in conversation, a warm curious ghostwriter helping the author develop ideas for their manuscript. Draw ideas OUT of them. Never spell out the acronym unprompted.

You exist ONLY to help with book and manuscript ideation. If they ask for anything else, redirect: "I'm here to help you brainstorm your book. What are you thinking about writing?"

CONTENT POLICY. Refuse to help develop graphic violence, sexual or erotic content, sexualization of minors, hate speech, illegal instructions, self-harm methods, or extremist ideology. If they steer there, say: "That's outside what I can help with here. Let's focus on a different angle for your book. What else is on your mind?"

Rules:
- Ask one question at a time.
- Keep spoken replies to one or two short sentences.
- Be genuinely curious. Probe for specifics. Mirror their language.
- Don't summarize what they said back to them. Push forward.
- Never suggest book titles, chapter structures, or outlines.
- You are NOT writing their book. Help them figure out what they want to say.
- Keep the overarching book topic. Sub-topics are threads inside that book.

LANGUAGE. Never use em dashes. Never use: furthermore, moreover, pivotal, nuanced, resonate, tapestry, journey, landscape, dive deep, unpack, lean into, transformative, robust, seamless, leverage, utilize, delve, embark, myriad, in essence, it's worth noting, interestingly, at the end of the day, game-changer, paradigm shift. Sound like a curious human.

Backchannel policy: Use moderate backchannels. Acknowledge naturally without competing with the main response.

Interruption policy: Stop speaking when the user interrupts. Listen to what they say. Keep listening while they pause to think. Do not treat a cough, music, or nearby conversation as a new request.

Delegation policy:
Backend tools:
- Research: look up sourced quotes, stats, and references for this book.

Delegate to the backend when:
- The author asks you to look something up, find a citation, or check a fact you cannot know from the conversation.

Do not delegate to the backend when:
- You can keep interviewing from the conversation.
- You need a brief clarification.

Do not guess research results while waiting.`;

export function isLiveVoice(value: unknown): value is LiveVoice {
  return typeof value === "string" && (LIVE_VOICES as readonly string[]).includes(value);
}

export function estimateLiveTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function isLiveInitPing(content: string): boolean {
  return content.trim() === LIVE_INIT_PING;
}

export function firstRealUserMessage(messages: BrainstormMessage[]): BrainstormMessage | undefined {
  return messages.find((m) => m.role === "user" && !isLiveInitPing(m.content));
}

export function buildLiveGreetingFacts(input: {
  fullName?: string | null;
  projectTitle?: string | null;
  projectAudience?: string | null;
}): LiveGreetingFacts {
  const rawName = String(input.fullName || "").trim();
  const firstName = rawName ? (rawName.split(/\s+/)[0] ?? "") : "";
  const title = input.projectTitle && !/^untitled/i.test(input.projectTitle) ? input.projectTitle : "";
  const audience = input.projectAudience && input.projectAudience !== "General" ? input.projectAudience : "";
  return { firstName, title, audience };
}

export function buildLiveInstructions(opts: {
  audienceBlock?: string | null;
  greeting?: LiveGreetingFacts | null;
  topicAnchor?: string | null;
  researchBlock?: string | null;
  isResume?: boolean;
}): string {
  const parts = [LIVE_INSTRUCTIONS];
  if (opts.audienceBlock) parts.push(opts.audienceBlock.trim());

  if (opts.topicAnchor) {
    parts.push(
      `TOPIC ANCHOR. The author's book is about: "${opts.topicAnchor.slice(0, 200)}"\nEvery question must stay rooted in this subject. When a sub-topic surfaces, explore it as an angle within this book, then return to the broader theme.`,
    );
  } else if (opts.greeting && !opts.isResume) {
    const known: string[] = [];
    if (opts.greeting.firstName) known.push(`The author's first name is ${JSON.stringify(opts.greeting.firstName)}. Greet them by it.`);
    if (opts.greeting.title) known.push(`Their working title is ${JSON.stringify(opts.greeting.title)}. Mention it naturally.`);
    if (opts.greeting.audience) known.push(`The book is aimed at a ${JSON.stringify(opts.greeting.audience)} audience. Acknowledge that.`);
    parts.push(
      `OPENING GREETING. After the session starts you will be asked to speak first. Open warmly as Theo in one or two sentences, then ask a single opening question. ${known.length ? known.join(" ") : "Nothing about the author or project is on file. Keep the greeting warm and generic."} Never invent a name, title, or audience that is not listed here.`,
    );
  }

  if (opts.isResume) {
    parts.push("This is a resumed conversation. Continue from the history already supplied. Do not restart the interview.");
  }

  if (opts.researchBlock) parts.push(opts.researchBlock.trim());
  return parts.join("\n\n");
}

export function buildLiveOpeningAppend(greeting: LiveGreetingFacts | null, isResume: boolean): string {
  if (isResume) {
    return "Continue the interview from the supplied history. Speak next only if a question is still open; otherwise listen.";
  }
  const name = greeting?.firstName || "there";
  return `Begin the conversation now, following the instructions provided. Greet ${name} as Theo and ask your single opening question, then pause and listen.`;
}

/**
 * Convert persisted studio turns into Live `session.input`. Drops the init ping,
 * keeps the first real user turn when possible, and trims from the middle to
 * stay under the 128-message / 8,192-token startup cap.
 */
export function messagesToLiveInput(messages: BrainstormMessage[]): LiveHistoryItem[] {
  const cleaned = messages.filter((m) => m.content.trim() && !isLiveInitPing(m.content));
  const items: LiveHistoryItem[] = cleaned.map((m): LiveHistoryItem => (
    m.role === "user"
      ? { type: "message", role: "user", content: [{ type: "input_text", text: m.content }] }
      : { type: "message", role: "assistant", content: [{ type: "output_text", text: m.content }] }
  ));

  const tokenCost = (item: LiveHistoryItem) => estimateLiveTokens(item.content[0]?.text ?? "");

  while (items.length > LIVE_MAX_HISTORY_MESSAGES) {
    const dropAt = items.length > 2 ? 1 : 0;
    items.splice(dropAt, 1);
  }

  let tokens = items.reduce((sum, item) => sum + tokenCost(item), 0);
  while (items.length > 1 && tokens > LIVE_MAX_HISTORY_TOKENS) {
    const dropAt = items.length > 2 ? 1 : 0;
    tokens -= tokenCost(items[dropAt]!);
    items.splice(dropAt, 1);
  }

  return items;
}

/**
 * Turn persisted studio messages into caption fragments that sort before any
 * Live `start_ms` (which begins at 0). Each seed turn is spaced farther apart
 * than LIVE_TRANSCRIPT_GAP_MS so grouping reconstitutes the original rows.
 */
export function messagesToSeedFragments(messages: BrainstormMessage[]): LiveTranscriptFragment[] {
  const cleaned = messages.filter((m) => m.content.trim() && !isLiveInitPing(m.content));
  return cleaned.map((message, index) => {
    const start = LIVE_SEED_FRAGMENT_END_MS - (cleaned.length - index) * LIVE_SEED_FRAGMENT_GAP_MS;
    return {
      speaker: message.role,
      delta: message.content,
      start_ms: start,
      end_ms: start + 1,
    };
  });
}

/**
 * Group overlapping Live transcript fragments into display turns. Late
 * fragments from the same speaker merge into their earlier row when they
 * overlap or sit inside LIVE_TRANSCRIPT_GAP_MS. Row order follows first
 * appearance, not last update.
 */
export function groupTranscriptFragments(
  fragments: LiveTranscriptFragment[],
  gapMs = LIVE_TRANSCRIPT_GAP_MS,
): BrainstormMessage[] {
  const sorted = [...fragments]
    .filter((f) => f.delta.length > 0)
    .sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms);

  const groups: Array<{
    role: "user" | "assistant";
    start: number;
    end: number;
    parts: string[];
  }> = [];

  for (const fragment of sorted) {
    let match: (typeof groups)[number] | undefined;
    for (let i = groups.length - 1; i >= 0; i--) {
      const group = groups[i]!;
      if (group.role !== fragment.speaker) continue;
      if (fragment.start_ms <= group.end + gapMs) {
        match = group;
        break;
      }
    }
    if (match) {
      match.parts.push(fragment.delta);
      match.end = Math.max(match.end, fragment.end_ms);
    } else {
      groups.push({
        role: fragment.speaker,
        start: fragment.start_ms,
        end: fragment.end_ms,
        parts: [fragment.delta],
      });
    }
  }

  return groups.map((group) => ({
    role: group.role,
    content: group.parts.join(""),
  }));
}

export function liveDurationSeconds(usage: unknown, fallbackSeconds = 0): number {
  if (usage && typeof usage === "object" && typeof (usage as { seconds?: unknown }).seconds === "number") {
    return (usage as { seconds: number }).seconds;
  }
  if (usage && typeof usage === "object" && typeof (usage as { duration_seconds?: unknown }).duration_seconds === "number") {
    return (usage as { duration_seconds: number }).duration_seconds;
  }
  return fallbackSeconds;
}

/** GPT-Live bills per second; do not round up to the next minute. Cap at one hour. */
export function inkLiveSessionCost(durationSeconds: number): number {
  const seconds = Math.max(0, Math.min(Number(durationSeconds) || 0, LIVE_MAX_SESSION_SECONDS));
  return Number(((seconds / 60) * INK_PER_LIVE_MINUTE).toFixed(4));
}

export function formatLiveResearchContext(
  items: ResearchItem[],
  recentUserText: string,
): string {
  const ranked = rankResearchItems(items, recentUserText);
  const block = formatResearchedSourcesBlock(ranked);
  if (!block) return "";
  if (block.length <= LIVE_APPEND_MAX_CHARS) return block.trim();
  return `${block.trim().slice(0, LIVE_APPEND_MAX_CHARS - 1)}…`;
}
