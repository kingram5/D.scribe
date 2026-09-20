/**
 * Builds exactly what is sent to the model for one of Theo's turns. Pure: no
 * I/O, no environment. The brainstorm route and the evaluation rig both call
 * this, so what gets graded is what ships.
 *
 * Layout of a turn:
 *   system  = [ STABLE text, cached for an hour ]
 *             rulebook + audience profile + topic anchor. Identical on every
 *             turn of a project.
 *   messages = the conversation window, with a PRIVATE block appended to the
 *             final author turn: opening greeting (first turn only), Theo's
 *             notes and orders, the material digest, researched sources.
 *             Nothing in the private block is ever stored in the conversation.
 */

import type { BrainstormMessage } from "@/lib/brainstorm-session";
import { buildBriefingBlock, type BriefingInput, type SessionHandoff } from "@/lib/brainstorm-briefing";
import { THEO_GENERIC_OPENER, THEO_SYSTEM_PROMPT } from "@/lib/theo/craft";
import { ledgerGaps } from "@/lib/theo/ingredients";
import {
  INIT_PING, askedQuestions, authorTurns, buildNotesBlock, callbackAllowed, computePacing,
  landingDeclinedAt, wrapPrivate, type Pacing, type TheoNotes,
} from "@/lib/theo/notes";

export interface GreetingInput {
  firstName: string;
  knownTitle: string;
  knownAudience: string;
  handoff?: SessionHandoff;
  priorAnswers: string[];
  primerText: string;
}

/** The opening turn only. Every fact is optional; nothing is ever invented. */
export function buildGreetingBlock({ firstName, knownTitle, knownAudience, handoff, priorAnswers, primerText }: GreetingInput): string {
  const known: string[] = [];
  if (firstName) known.push(`The author's first name is ${JSON.stringify(firstName)}. Greet them by it.`);
  if (knownTitle) known.push(`Their working title is ${JSON.stringify(knownTitle)}. Mention it naturally.`);
  if (knownAudience) known.push(`The book is aimed at a ${JSON.stringify(knownAudience)} audience. Acknowledge that.`);
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
  return `OPENING GREETING. This is the very first message of the session. Open warmly as Theo, in one or two sentences, before your first question: introduce yourself briefly and show you already know this project.\n${known.length ? known.join("\n") : "Nothing about the author or project is on file yet. Keep the greeting warm and generic."}\nThen ask your single opening question. Never invent a name, title, or audience that is not listed above.`;
}

/** Stored topic wins, then a real title, then (new projects only) the first thing the author typed. */
export function topicAnchor(projectTopic: string, knownTitle: string, returning: boolean, firstRealUserText: string): string {
  const anchorText = projectTopic || knownTitle || (!returning ? firstRealUserText.slice(0, 200) : "");
  return anchorText
    ? `\n\nTOPIC ANCHOR. This book is about: ${JSON.stringify(anchorText)}\nEvery question stays rooted in that subject. When a sub-topic surfaces, explore it as an angle within this book, then return to the broader theme.`
    : "";
}

export interface AssembleInput {
  /** What the studio sent: a window of the conversation, ending on the author's turn. */
  history: BrainstormMessage[];
  /** The whole session so far, for everything counted in code. Defaults to `history`. */
  session?: BrainstormMessage[];
  audienceBlock: string | null;
  projectAudience: string;
  anchorBlock: string;
  /** Only used when the author has not spoken yet. */
  greeting?: GreetingInput;
  notes: TheoNotes;
  personalNorm: number | null;
  briefing: BriefingInput;
  researchBlock?: string;
}

export type SystemBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral"; ttl: "1h" } };
export type ClaudeMessage = { role: "user" | "assistant"; content: string | { type: "text"; text: string }[] };

export interface AssembledTurn {
  system: SystemBlock[];
  messages: ClaudeMessage[];
  pacing: Pacing;
  callbackOk: boolean;
  privateBlock: string;
}

export function assembleTheoTurn(input: AssembleInput): AssembledTurn {
  const { history, audienceBlock, projectAudience, anchorBlock, notes, personalNorm, briefing } = input;
  const session = input.session ?? history;
  const started = history.some((m) => m.role === "user" && m.content.trim() !== INIT_PING);
  const spoken = authorTurns(history);
  const sessionSpoken = authorTurns(session);

  // STABLE: identical on every turn of a project, so it caches. Authors pause
  // for minutes between answers, which is why the 1-hour cache is the one used.
  const stableSystem = THEO_SYSTEM_PROMPT + (audienceBlock ?? `\n\n${THEO_GENERIC_OPENER}`) + anchorBlock;

  const pacing = computePacing({ messages: session, personalNorm, landingDeclinedAtTurn: landingDeclinedAt(session) });
  const callbackOk = callbackAllowed(session);

  const greetingBlock = !started && input.greeting ? buildGreetingBlock(input.greeting) : "";
  const notesBlock = started
    ? buildNotesBlock({
        notes,
        pacing,
        callbackOk,
        alreadyAsked: askedQuestions(briefing.pastSessions ?? []),
        gaps: sessionSpoken.length >= 3 ? ledgerGaps(projectAudience, notes.captured).map((g) => g.need) : [],
      })
    : "";
  const digestBlock = buildBriefingBlock(briefing, spoken.slice(-2).join(" "));
  const privateBlock = wrapPrivate([greetingBlock, notesBlock, digestBlock, input.researchBlock ?? ""]);

  // Only the stable system text carries a cache breakpoint: the history is a
  // sliding window, so a breakpoint on it would pay the cache-write premium for
  // a prefix that is never read again.
  const lastUserIdx = history.map((m) => m.role).lastIndexOf("user");
  const messages: ClaudeMessage[] = history.map((m, i) => ({
    role: m.role,
    content: i === lastUserIdx && privateBlock
      ? [{ type: "text" as const, text: m.content }, { type: "text" as const, text: privateBlock }]
      : m.content,
  }));

  return {
    system: [{ type: "text", text: stableSystem, cache_control: { type: "ephemeral", ttl: "1h" } }],
    messages,
    pacing,
    callbackOk,
    privateBlock,
  };
}

/** The studio's window: the opening ping, the first exchange, then the last 8 messages. */
export function studioWindow(all: BrainstormMessage[], size = 8): BrainstormMessage[] {
  const body = all.filter((m, i) => !(i === 0 && m.role === "user" && m.content.trim() === INIT_PING));
  const first = body.slice(0, 2);
  const rest = body.slice(2);
  return [{ role: "user", content: INIT_PING }, ...first, ...(rest.length > size ? rest.slice(-size) : rest)];
}
