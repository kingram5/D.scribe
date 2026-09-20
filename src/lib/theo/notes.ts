/**
 * Theo's private notebook. Pure functions, no I/O.
 *
 * The interviewer used to carry nothing between turns except the chat history.
 * A working ghostwriter keeps notes: which threads are open, which lines are
 * worth keeping, what the chapter still needs, what has already been asked.
 *
 * Two halves:
 *  - CODE-COMPUTED facts (energy, pacing, callback budget, question memory).
 *    These cost no tokens and are never left to the model's judgement.
 *  - MODEL-WRITTEN notes (threads, ingredients, keeper lines, tensions), written
 *    by a small model AFTER each reply while the author is typing, then checked
 *    here before they are trusted. A keeper line that is not a verbatim
 *    substring of something the author said is thrown away.
 */

import type { BrainstormMessage } from "@/lib/brainstorm-session";

export const INIT_PING = "Start the brainstorm session.";

export interface TheoNotes {
  version: 1;
  /** Threads the author opened. `mined` flips once Theo has gone underneath it. */
  threads: { label: string; mined: boolean }[];
  /** Chapter ingredients captured so far (ids from theo/ingredients.ts). */
  captured: string[];
  /** The author's verbatim best lines. Always string-checked against the transcript. */
  keeperLines: string[];
  /** Pairs of the author's own statements that pull against each other. */
  tensions: { a: string; b: string }[];
  /** The author's own images and phrases, for Theo to reuse in their words. */
  phrases: string[];
  /** The book in one sentence, once the author has said it. */
  premise: string;
  /** True when the last answer sounded like a polished stage version. */
  rehearsed: boolean;
  /** One instruction for the next turn, 25 words at most. */
  directive: string;
  /** Count of author turns these notes were written against. */
  atTurn: number;
}

export function emptyNotes(): TheoNotes {
  return {
    version: 1, threads: [], captured: [], keeperLines: [], tensions: [],
    phrases: [], premise: "", rehearsed: false, directive: "", atTurn: 0,
  };
}

const clean = (s: unknown, max: number): string =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";

const normalize = (s: string): string =>
  s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/** Author turns only, without the synthetic opening ping. */
export function authorTurns(messages: BrainstormMessage[]): string[] {
  return messages.filter((m) => m.role === "user" && m.content.trim() !== INIT_PING).map((m) => m.content);
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/**
 * Keep only lines the author actually said. Matching is case and whitespace
 * insensitive but otherwise exact, and the ORIGINAL wording from the transcript
 * is what gets stored, never the model's copy of it.
 */
export function verifyVerbatim(candidates: unknown, spoken: string[], opts = { min: 20, max: 240, keep: 12 }): string[] {
  if (!Array.isArray(candidates)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const want = normalize(clean(c, opts.max + 40).replace(/^["'“]+|["'”]+$/g, ""));
    if (want.length < opts.min) continue;
    for (const turn of spoken) {
      const flat = turn.replace(/\s+/g, " ");
      const idx = normalize(flat).indexOf(want);
      if (idx < 0) continue;
      const original = flat.slice(idx, idx + want.length).trim();
      const key = normalize(original);
      if (original.length <= opts.max && !seen.has(key)) { seen.add(key); out.push(original); }
      break;
    }
    if (out.length >= opts.keep) break;
  }
  return out;
}

/**
 * Merge a model-written update into the running notes. Everything is bounded
 * and sanitised; nothing here can grow without limit or carry text the author
 * did not say into a "verbatim" field.
 */
export function mergeNotes(prev: TheoNotes, update: unknown, messages: BrainstormMessage[], knownIngredients: string[]): TheoNotes {
  const u = (update && typeof update === "object" ? update : {}) as Record<string, unknown>;
  const spoken = authorTurns(messages);

  const threadMap = new Map(prev.threads.map((t) => [normalize(t.label), t]));
  if (Array.isArray(u.threads)) {
    for (const raw of u.threads) {
      const r = (raw ?? {}) as { label?: unknown; mined?: unknown };
      const label = clean(r.label, 80);
      if (!label) continue;
      const key = normalize(label);
      const existing = threadMap.get(key);
      // A thread never goes back from mined to unmined.
      threadMap.set(key, { label: existing?.label ?? label, mined: Boolean(existing?.mined) || r.mined === true });
    }
  }

  const captured = new Set(prev.captured);
  if (Array.isArray(u.captured)) for (const id of u.captured) if (typeof id === "string" && knownIngredients.includes(id)) captured.add(id);

  const keeper = verifyVerbatim([...(Array.isArray(u.keeperLines) ? u.keeperLines : []), ...prev.keeperLines], spoken);
  const phrases = verifyVerbatim([...(Array.isArray(u.phrases) ? u.phrases : []), ...prev.phrases], spoken, { min: 4, max: 80, keep: 10 });

  const tensions = [...prev.tensions];
  if (Array.isArray(u.tensions)) {
    for (const raw of u.tensions) {
      const r = (raw ?? {}) as { a?: unknown; b?: unknown };
      const [a] = verifyVerbatim([r.a], spoken, { min: 12, max: 200, keep: 1 });
      const [b] = verifyVerbatim([r.b], spoken, { min: 12, max: 200, keep: 1 });
      if (a && b && a !== b && !tensions.some((t) => t.a === a && t.b === b)) tensions.push({ a, b });
    }
  }

  const [premise] = verifyVerbatim([u.premise], spoken, { min: 20, max: 300, keep: 1 });

  return {
    version: 1,
    threads: [...threadMap.values()].slice(-14),
    captured: [...captured],
    keeperLines: keeper,
    tensions: tensions.slice(-4),
    phrases,
    premise: premise || prev.premise,
    rehearsed: u.rehearsed === true,
    directive: clean(u.directive, 220),
    atTurn: spoken.length,
  };
}

/** Parse whatever is in the database column into usable notes. Never throws. */
export function readNotes(raw: unknown): TheoNotes {
  if (!raw || typeof raw !== "object") return emptyNotes();
  const r = raw as Partial<TheoNotes>;
  const base = emptyNotes();
  return {
    ...base,
    threads: Array.isArray(r.threads) ? r.threads.filter((t) => t && typeof t.label === "string").slice(-14) : [],
    captured: Array.isArray(r.captured) ? r.captured.filter((x) => typeof x === "string") : [],
    keeperLines: Array.isArray(r.keeperLines) ? r.keeperLines.filter((x) => typeof x === "string").slice(0, 12) : [],
    tensions: Array.isArray(r.tensions) ? r.tensions.filter((t) => t && typeof t.a === "string" && typeof t.b === "string").slice(-4) : [],
    phrases: Array.isArray(r.phrases) ? r.phrases.filter((x) => typeof x === "string").slice(0, 10) : [],
    premise: typeof r.premise === "string" ? r.premise : "",
    rehearsed: r.rehearsed === true,
    directive: typeof r.directive === "string" ? r.directive : "",
    atTurn: typeof r.atTurn === "number" ? r.atTurn : 0,
  };
}

// ── Question memory ────────────────────────────────────────────────────────

/** Theo's own past questions, newest last, deduped. */
export function askedQuestions(sessions: BrainstormMessage[][], keep = 10): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const messages of sessions) {
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      const sentences = m.content.replace(/\s+/g, " ").match(/[^.!?]*\?/g) ?? [];
      const q = sentences.length ? sentences[sentences.length - 1].trim() : "";
      if (q.length < 15 || q.length > 220) continue;
      const key = normalize(q);
      if (!seen.has(key)) { seen.add(key); out.push(q); }
    }
  }
  return out.slice(-keep);
}

// ── Callback budget (Kyle 2026-09-19: spoken callbacks max 1 in 5 turns) ────

export const CALLBACK_WINDOW = 5;

/**
 * A spoken callback is Theo quoting the author's earlier words back to them.
 * Detected in code: an assistant message containing a quoted run of 4+ words
 * that appears verbatim in an EARLIER author turn. The model's own claim about
 * whether it called back is never consulted.
 */
export function isCallback(assistantText: string, earlierAuthorTurns: string[]): boolean {
  const quoted = assistantText.match(/["“]([^"“”]{12,240})["”]/g) ?? [];
  if (!quoted.length || !earlierAuthorTurns.length) return false;
  const hay = normalize(earlierAuthorTurns.join(" \n "));
  return quoted.some((q) => {
    const inner = normalize(q.slice(1, -1));
    return inner.split(" ").length >= 4 && hay.includes(inner);
  });
}

/** Turns since Theo last called back; Infinity if never. The opening greeting does not count. */
export function turnsSinceCallback(messages: BrainstormMessage[]): number {
  const authorSoFar: string[] = [];
  let lastCallbackAt = -1;
  let assistantIndex = -1;
  for (const m of messages) {
    if (m.role === "user") { if (m.content.trim() !== INIT_PING) authorSoFar.push(m.content); continue; }
    assistantIndex++;
    // Exclude the turn the author just gave: a reflection of the LAST answer is not a callback.
    if (assistantIndex > 0 && isCallback(m.content, authorSoFar.slice(0, -1))) lastCallbackAt = assistantIndex;
  }
  return lastCallbackAt < 0 ? Infinity : assistantIndex - lastCallbackAt;
}

export function callbackAllowed(messages: BrainstormMessage[]): boolean {
  return turnsSinceCallback(messages) >= CALLBACK_WINDOW;
}

// ── Pacing: energy against the author's OWN baseline (no clock, no picker) ──

export type PacingState = "warmup" | "deep" | "lighten" | "land";

export interface Pacing {
  state: PacingState;
  turns: number;
  /** Mean words of the last 3 answers divided by the mean of the earlier ones. 1 = steady. */
  energy: number;
  reason: string;
}

export interface PacingInput {
  messages: BrainstormMessage[];
  /** Median author turns at which THIS user has finished past sessions; null until 3 sessions exist. */
  personalNorm: number | null;
  /** Assistant-turn index at which a landing was last offered and declined; -1 if never. */
  landingDeclinedAtTurn?: number;
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function computePacing({ messages, personalNorm, landingDeclinedAtTurn = -1 }: PacingInput): Pacing {
  const answers = authorTurns(messages).map(wordCount);
  const turns = answers.length;
  if (turns < 3) return { state: "warmup", turns, energy: 1, reason: "opening exchanges" };

  const recent = answers.slice(-3);
  const earlier = answers.slice(0, -3);
  // Until there is an "earlier", the author cannot be measured against themselves.
  const baseline = earlier.length >= 3 ? mean(earlier) : 0;
  const energy = baseline > 0 ? mean(recent) / baseline : 1;

  // A naturally brief author is not a tired one: fading means a DROP from their own level.
  const lastTwoShort = baseline >= 12 && answers.slice(-2).every((w) => w <= baseline * 0.5);
  const lastOneShort = baseline >= 12 && answers[turns - 1] <= baseline * 0.5;
  const pastNorm = personalNorm != null && personalNorm >= 4 && turns >= Math.ceil(personalNorm * 1.25);
  const nearNorm = personalNorm != null && personalNorm >= 4 && turns >= Math.floor(personalNorm * 0.85);

  // After "one more", stay quiet until the energy dips again or 8 more turns pass.
  const recentlyDeclined = landingDeclinedAtTurn >= 0 && turns - landingDeclinedAtTurn < 8;

  if (lastTwoShort && !recentlyDeclined) return { state: "land", turns, energy, reason: "two short answers in a row against their own baseline" };
  if (pastNorm && !recentlyDeclined) return { state: "land", turns, energy, reason: "well past where this author usually finishes" };
  if (lastOneShort) return { state: "lighten", turns, energy, reason: "last answer dropped to half their usual length" };
  if (nearNorm && !recentlyDeclined) return { state: "land", turns, energy, reason: "near where this author usually finishes" };
  return { state: "deep", turns, energy, reason: "steady" };
}

/** Median author-turn count of a user's finished sessions; null until there are three. */
export function personalNormFrom(turnCounts: number[]): number | null {
  const xs = turnCounts.filter((n) => Number.isFinite(n) && n >= 3).sort((a, b) => a - b);
  if (xs.length < 3) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
}

const PACING_LINES: Record<PacingState, string> = {
  warmup: "PACING: opening exchanges. Keep questions easy and warm; save the hard ones.",
  deep: "",
  lighten: "PACING: their last answer was much shorter than usual. Ask something lighter and concrete next. Do not mention length or tiredness.",
  land:
    'PACING: start landing. Open no new threads. Close out the strongest open one, then ask one closing question such as "If your reader remembers one thing from today, what is it?" After their answer, offer ONCE: "Good place to land, or one more?" and mention they can tap Finish. If they want to keep going, keep going and do not offer again. Never end the session yourself and never mention time, length or tiredness.',
};

// ── What Theo actually sees ────────────────────────────────────────────────

export interface NotesBlockInput {
  notes: TheoNotes;
  pacing: Pacing;
  callbackOk: boolean;
  alreadyAsked: string[];
  /** Human labels of the most valuable missing ingredients, best first. */
  gaps: string[];
}

export const NOTES_BUDGET = 1500;

/**
 * The volatile tail of the system prompt. Bounded, and written so that the
 * code-enforced facts (callback budget, pacing) read as orders, not hints.
 */
export function buildNotesBlock({ notes, pacing, callbackOk, alreadyAsked, gaps }: NotesBlockInput): string {
  const lines: string[] = ["YOUR PRIVATE NOTES (the author never sees these; never read them out or mention note-taking):"];

  // Code-enforced orders go FIRST so a budget trim can never cut them.
  lines.push(
    callbackOk
      ? "CALLBACKS: you MAY quote the author's earlier words back this turn, but only if (a) they just contradicted something they said before, (b) they are repeating material already recorded, so say so and go underneath it, or (c) they are stuck. Otherwise keep what you know to yourself and let it sharpen the question."
      : "CALLBACKS: you quoted the author back recently. This turn, do NOT quote or cite anything they said before their last answer. Use what you know silently.",
  );

  const pace = PACING_LINES[pacing.state];
  if (pace) lines.push(pace);

  const open = notes.threads.filter((t) => !t.mined).map((t) => t.label);
  if (open.length) lines.push(`Open threads not yet mined: ${open.slice(-5).join(" | ")}`);
  if (notes.premise) lines.push(`Their one-sentence premise so far: "${notes.premise}"`);
  if (notes.phrases.length) lines.push(`Their own images and phrases (reuse in THEIR words): ${notes.phrases.slice(0, 5).map((p) => `"${p}"`).join(", ")}`);
  if (notes.rehearsed) lines.push("Their last answer sounded like a polished stage version. Go around it.");
  if (gaps.length) lines.push(`The book still needs, most valuable first: ${gaps.slice(0, 3).join("; ")}. Steer toward ONE of these only when the conversation allows it. Never name chapters, ingredients or structure to the author, and never ask more than two such questions in a row. Mining a live thread always comes first.`);
  if (notes.tensions.length) {
    const t = notes.tensions[notes.tensions.length - 1];
    lines.push(`Two things they said that pull against each other: "${t.a}" / "${t.b}".`);
  }

  if (alreadyAsked.length) lines.push(`ALREADY ASKED (do not repeat; if you return to one, go underneath the old answer): ${alreadyAsked.map((q) => `"${q}"`).join(" ")}`);
  if (notes.directive) lines.push(`Note to self for this turn: ${notes.directive}`);

  let block = lines.join("\n");
  if (block.length > NOTES_BUDGET) block = block.slice(0, NOTES_BUDGET - 1).trimEnd() + "…";
  return block;
}

// ── Landing offers ─────────────────────────────────────────────────────────

const LANDING_OFFER = /good place to land|one more\?|land here|wrap (up|here)|tap finish/i;

/**
 * Author-turn count at which Theo last offered a landing and the author kept
 * going anyway; -1 if that has not happened. Read from the transcript, so it
 * survives reloads and costs nothing.
 */
export function landingDeclinedAt(messages: BrainstormMessage[]): number {
  let authorCount = 0;
  let offeredAt = -1;
  let declinedAt = -1;
  for (const m of messages) {
    if (m.role === "assistant") {
      if (LANDING_OFFER.test(m.content)) offeredAt = authorCount;
      continue;
    }
    if (m.content.trim() === INIT_PING) continue;
    authorCount++;
    // They answered the offer and the conversation is still going: a decline.
    if (offeredAt >= 0 && authorCount === offeredAt + 1) declinedAt = authorCount;
  }
  return declinedAt;
}

/** Wrap the volatile per-turn material so the model never mistakes it for the author speaking. */
export const PRIVATE_TAG_OPEN = "<theo_private>";
export const PRIVATE_TAG_CLOSE = "</theo_private>";

export function wrapPrivate(blocks: string[]): string {
  const body = blocks.map((b) => b.trim()).filter(Boolean).join("\n\n");
  return body ? `${PRIVATE_TAG_OPEN}\n${body}\n${PRIVATE_TAG_CLOSE}` : "";
}

/** Authors cannot smuggle a private block in through the chat box. */
export function stripPrivateTags(text: string): string {
  return text.replace(/<\/?theo_private>/gi, "");
}
