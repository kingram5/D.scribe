/**
 * Theo evaluation rig. Runs the SAME assembly the brainstorm route uses
 * (src/lib/theo/assemble.ts) against simulated authors, side by side with Theo
 * as he runs in production today, and records what each arm really costs.
 *
 *   npm run eval:theo            full run (6 authors x 2 arms x 12 turns)
 *   THEO_EVAL_TURNS=4 THEO_EVAL_PERSONAS=pastor,oneword npm run eval:theo
 *
 * It spends real money on the project's Anthropic key: a full run is a few
 * dollars. It never touches the database.
 */

import type { BrainstormMessage } from "@/lib/brainstorm-session";
import { brainstormProfileBlock } from "@/lib/audience-profiles";
import { assembleTheoTurn, studioWindow, topicAnchor, type ClaudeMessage, type SystemBlock } from "@/lib/theo/assemble";
import { ingredientsFor } from "@/lib/theo/ingredients";
import { INIT_PING, authorTurns, emptyNotes, isCallback, mergeNotes, wordCount, type TheoNotes } from "@/lib/theo/notes";
import { RECAP_SYSTEM, SCRIBE_SYSTEM, buildRecap, recapUserMessage, scribeUserMessage } from "@/lib/theo/scribe";
import { cleanJsonLite } from "@/lib/claude-lite";
import { BASELINE_MODEL, BASELINE_PROMPT } from "./baseline-prompt";
import { brainstormProfileBlock as baselineProfileBlock } from "./baseline-audience-profiles";
import { personaSystem, type Persona } from "./personas";

const API_URL = "https://api.anthropic.com/v1/messages";
export const SONNET = "claude-sonnet-4-6";
export const HAIKU = "claude-haiku-4-5-20251001";

/** US dollars per million tokens. Cache write is the 1-hour rate (2x input). */
const PRICE: Record<string, { in: number; out: number; read: number; write: number }> = {
  [SONNET]: { in: 3, out: 15, read: 0.3, write: 6 },
  [HAIKU]: { in: 1, out: 5, read: 0.1, write: 2 },
};

export interface Usage { model: string; input: number; output: number; cacheRead: number; cacheWrite: number }
export const usd = (u: Usage): number => {
  const p = PRICE[u.model];
  return (u.input * p.in + u.output * p.out + u.cacheRead * p.read + u.cacheWrite * p.write) / 1e6;
};

async function claude(model: string, system: string | SystemBlock[], messages: ClaudeMessage[], maxTokens: number, temperature: number): Promise<{ text: string; usage: Usage }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system, messages }),
    });
    if (res.ok) {
      const d = await res.json();
      const text = (Array.isArray(d.content) ? d.content.find((b: { type?: string }) => b?.type === "text")?.text : "") ?? "";
      return {
        text,
        usage: { model, input: d.usage?.input_tokens ?? 0, output: d.usage?.output_tokens ?? 0, cacheRead: d.usage?.cache_read_input_tokens ?? 0, cacheWrite: d.usage?.cache_creation_input_tokens ?? 0 },
      };
    }
    if (attempt >= 4 || ![429, 500, 502, 503, 529].includes(res.status)) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
}

export type Arm = "baseline" | "v2";

export interface TurnLog { theo: string; author: string; factsRevealed: string[]; pacing?: string; callbackOk?: boolean }
export interface SessionResult {
  persona: string;
  arm: Arm;
  turns: TurnLog[];
  transcript: BrainstormMessage[];
  usage: { theo: Usage[]; scribe: Usage[]; recap: Usage[] };
  notes?: TheoNotes;
  recap?: unknown;
  factsDisclosed?: string[];
}

const FACT_TAG = /\[\[(F\d)\]\]/g;

export async function runSession(persona: Persona, arm: Arm, turns: number): Promise<SessionResult> {
  const result: SessionResult = { persona: persona.id, arm, turns: [], transcript: [], usage: { theo: [], scribe: [], recap: [] } };
  const all: BrainstormMessage[] = []; // the conversation without the init ping, as the studio keeps it
  let notes = emptyNotes();
  const knownTitle = /^untitled/i.test(persona.title) ? "" : persona.title;
  const ingredients = ingredientsFor(persona.audience);

  const authorSystem = personaSystem(persona);
  // The simulated author sees the interview from their side.
  const authorView = (): ClaudeMessage[] => {
    const msgs: ClaudeMessage[] = [];
    for (const m of all) msgs.push({ role: m.role === "assistant" ? "user" : "assistant", content: m.content });
    return msgs;
  };

  for (let t = 0; t <= turns; t++) {
    // ── Theo's turn ──
    const history = all.length === 0 ? [{ role: "user" as const, content: INIT_PING }] : studioWindow(all);
    let theoText: string;
    let pacing: string | undefined;
    let callbackOk: boolean | undefined;

    if (arm === "baseline") {
      const first = all.find((m) => m.role === "user");
      const audienceBlock = baselineProfileBlock(persona.audience, null);
      const base = audienceBlock ? BASELINE_PROMPT + audienceBlock : BASELINE_PROMPT;
      const system = first
        ? base + `\n\nTOPIC ANCHOR — The user's book is about: "${first.content.slice(0, 200)}"\nEvery question you ask must stay rooted in this overarching subject. When a sub-topic surfaces, explore it as a chapter or angle within this book, then return to the broader theme.`
        : base + `\n\nOPENING GREETING — This is the very first message of the session. Open warmly as Theo, in one or two sentences, before your first question: introduce yourself briefly and show you already know this project.\nThe author's first name is ${JSON.stringify(persona.name)} — greet them by it.${knownTitle ? `\nTheir working title is ${JSON.stringify(knownTitle)} — mention it naturally.` : ""}\nThe book is aimed at a ${JSON.stringify(persona.audience)} audience — acknowledge that.\nThen ask your single opening question. Never invent a name, title, or audience that is not listed above.`;
      const r = await claude(BASELINE_MODEL, system, history.map((m) => ({ role: m.role, content: m.content })), 512, 0.7);
      theoText = r.text; result.usage.theo.push(r.usage);
    } else {
      const turn = assembleTheoTurn({
        history,
        session: [{ role: "user", content: INIT_PING }, ...all],
        audienceBlock: brainstormProfileBlock(persona.audience, null),
        projectAudience: persona.audience,
        anchorBlock: topicAnchor("", knownTitle, false, all.find((m) => m.role === "user")?.content ?? ""),
        greeting: { firstName: persona.name, knownTitle, knownAudience: persona.audience, priorAnswers: [], primerText: "" },
        notes,
        personalNorm: null,
        briefing: { keyPoints: [], transcripts: [], handoffs: [], thinChapters: [], pastSessions: [] },
      });
      pacing = turn.pacing.state; callbackOk = turn.callbackOk;
      const r = await claude(SONNET, turn.system, turn.messages, 900, 0.7);
      theoText = r.text; result.usage.theo.push(r.usage);
    }
    all.push({ role: "assistant", content: theoText });
    if (t === turns) { result.turns.push({ theo: theoText, author: "", factsRevealed: [], pacing, callbackOk }); break; }

    // ── The author answers ──
    const a = await claude(HAIKU, authorSystem, authorView(), 400, 0.8);
    const revealed = [...a.text.matchAll(FACT_TAG)].map((m) => m[1]);
    const authorText = a.text.replace(FACT_TAG, "").replace(/\s+$/g, "").trim();
    all.push({ role: "user", content: authorText });
    result.turns.push({ theo: theoText, author: authorText, factsRevealed: revealed, pacing, callbackOk });

    // ── v2 only: the note-taker runs after the reply, exactly as the studio does ──
    if (arm === "v2") {
      try {
        const s = await claude(HAIKU, SCRIBE_SYSTEM, [{ role: "user", content: scribeUserMessage([{ role: "user", content: INIT_PING }, ...all], notes, ingredients) }], 700, 0.2);
        result.usage.scribe.push(s.usage);
        notes = mergeNotes(notes, JSON.parse(cleanJsonLite(s.text)), all, ingredients.map((i) => i.id));
      } catch { /* a missed note is allowed, as in production */ }
    }
  }

  if (arm === "v2") {
    try {
      const r = await claude(HAIKU, RECAP_SYSTEM, [{ role: "user", content: recapUserMessage(all) }], 900, 0.3);
      result.usage.recap.push(r.usage);
      result.recap = buildRecap(JSON.parse(cleanJsonLite(r.text)), all, notes.keeperLines).recap;
    } catch { /* falls back to the code-computed card in production */ }
    result.notes = notes;
  }
  result.transcript = all;

  // Which buried facts actually came out? The actor's own tags proved unreliable,
  // so a strict checker reads only the AUTHOR's words against each fact.
  try {
    const authorText = all.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    const factList = persona.facts.map((f) => `${f.id}: ${f.fact}`).join("\n");
    const r = await claude(HAIKU, 'You check whether specific facts were disclosed in a text. A fact counts as disclosed only if its CORE detail is actually stated (the person, event or number), not merely hinted at or a related theme. Return ONLY JSON: {"disclosed":["F1"]}.',
      [{ role: "user", content: `FACTS\n${factList}\n\nTEXT (everything the author said)\n${authorText}` }], 200, 0);
    const ids = (JSON.parse(cleanJsonLite(r.text)) as { disclosed?: unknown }).disclosed;
    result.factsDisclosed = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && persona.facts.some((f) => f.id === x)) : [];
  } catch { result.factsDisclosed = [...new Set(result.turns.flatMap((t) => t.factsRevealed))]; }
  return result;
}

// ── Code-counted metrics: no model judgement involved ──────────────────────

export interface CodeMetrics {
  factsFound: number;
  factsTotal: number;
  authorWords: number;
  theoWords: number;
  authorShare: number;
  avgTheoWords: number;
  multiQuestionTurns: number;
  inventedQuotes: number;
  callbacks: number;
  repeatedQuestions: number;
  emDashes: number;
  keeperLines: number;
  ingredientsCaptured: number;
}

export function codeMetrics(s: SessionResult, persona: Persona): CodeMetrics {
  const theoTurns = s.transcript.filter((m) => m.role === "assistant").map((m) => m.content);
  const spoken = authorTurns(s.transcript);
  const authorWords = spoken.reduce((n, t) => n + wordCount(t), 0);
  const theoWords = theoTurns.reduce((n, t) => n + wordCount(t), 0);
  const found = new Set(s.factsDisclosed ?? s.turns.flatMap((t) => t.factsRevealed));

  let invented = 0, callbacks = 0;
  const soFar: string[] = [];
  let ti = 0;
  for (const m of s.transcript) {
    if (m.role === "user") { soFar.push(m.content); continue; }
    const quotes = m.content.match(/["“]([^"“”]{12,240})["”]/g) ?? [];
    const hay = soFar.join(" \n ").toLowerCase().replace(/\s+/g, " ");
    for (const q of quotes) {
      const inner = q.slice(1, -1).toLowerCase().replace(/\s+/g, " ").trim();
      // A quoted run of 5+ words presented to the author that they never said.
      if (inner.split(" ").length >= 5 && !hay.includes(inner) && /\byou (said|told|mentioned|called)\b/i.test(m.content)) invented++;
    }
    if (ti > 0 && isCallback(m.content, soFar.slice(0, -1))) callbacks++;
    ti++;
  }

  const questions = theoTurns.map((t) => (t.replace(/\s+/g, " ").match(/[^.!?]*\?/g) ?? []).map((q) => q.trim().toLowerCase()));
  const seen = new Set<string>(); let repeated = 0;
  for (const qs of questions) { const last = qs[qs.length - 1]; if (!last) continue; if (seen.has(last)) repeated++; seen.add(last); }

  return {
    factsFound: found.size,
    factsTotal: persona.facts.length,
    authorWords, theoWords,
    authorShare: authorWords + theoWords ? authorWords / (authorWords + theoWords) : 0,
    avgTheoWords: theoTurns.length ? theoWords / theoTurns.length : 0,
    multiQuestionTurns: questions.filter((qs) => qs.length > 1).length,
    inventedQuotes: invented,
    callbacks,
    repeatedQuestions: repeated,
    emDashes: theoTurns.filter((t) => t.includes("—")).length,
    keeperLines: s.notes?.keeperLines.length ?? 0,
    ingredientsCaptured: s.notes?.captured.length ?? 0,
  };
}

// ── Blind judging ──────────────────────────────────────────────────────────

export const RUBRIC = [
  "scene: the interviewer asked for a specific place, moment or person rather than a topic, and got one",
  "depth: the interviewer went underneath answers (what it cost, where it came from) instead of moving on",
  "stage_version: when the author gave a polished or abstract answer, the interviewer went around it",
  "surprise: when the author said something unexpected, the next question followed it",
  "restraint: short turns, one question at a time, no praise, no summarising back",
  "writable: by the end a ghostwriter would have scenes, names, numbers and quotable lines to write from",
] as const;

const JUDGE_SYSTEM = `You grade book interviews. You will see two interviews of the SAME author by two different interviewers, labelled A and B. You do not know which is which and must not guess. Score each interviewer on each rubric line: 0 = absent or done badly, 1 = partly, 2 = done well. Judge only what is on the page. Return ONLY JSON: {"A":{"scene":0,"depth":0,"stage_version":0,"surprise":0,"restraint":0,"writable":0},"B":{...},"better":"A"|"B"|"tie","why":"one sentence"}.`;

export async function judgePair(a: SessionResult, b: SessionResult): Promise<{ scores: Record<Arm, Record<string, number>>; better: Arm | "tie"; why: string; usage: Usage[] }> {
  const fmt = (s: SessionResult) => s.transcript.map((m) => `${m.role === "assistant" ? "INTERVIEWER" : "AUTHOR"}: ${m.content}`).join("\n");
  const usage: Usage[] = [];
  const totals: Record<Arm, Record<string, number>> = { baseline: {}, v2: {} };
  const votes: (Arm | "tie")[] = [];
  let why = "";
  // Two judgings with the labels swapped, so position cannot decide it. Lower score kept per line.
  for (const flip of [false, true]) {
    const [first, second] = flip ? [b, a] : [a, b];
    const r = await claude(SONNET, JUDGE_SYSTEM, [{ role: "user", content: `RUBRIC\n${RUBRIC.join("\n")}\n\nINTERVIEW A\n${fmt(first)}\n\nINTERVIEW B\n${fmt(second)}` }], 600, 0);
    usage.push(r.usage);
    const j = JSON.parse(cleanJsonLite(r.text)) as { A: Record<string, number>; B: Record<string, number>; better: string; why: string };
    const map: Record<"A" | "B", SessionResult> = { A: first, B: second };
    for (const label of ["A", "B"] as const) {
      const arm = map[label].arm;
      for (const [k, v] of Object.entries(j[label] ?? {})) totals[arm][k] = Math.min(totals[arm][k] ?? 2, Number(v) || 0);
    }
    votes.push(j.better === "A" ? first.arm : j.better === "B" ? second.arm : "tie");
    why = j.why || why;
  }
  const better = votes[0] === votes[1] ? votes[0] : "tie";
  return { scores: totals, better, why, usage };
}
