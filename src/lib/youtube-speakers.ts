/**
 * Speaker split for YouTube imports (Kyle 2026-09-27, option 1). The caption
 * text arrives as one voice; a cheap model pass reads it for speaker changes
 * (YouTube's ">>" marker, question/answer turns, introductions) and returns
 * only where each speaker's turn starts. The author then confirms or fixes the
 * speakers on the transcript page like any other upload.
 */

import { callClaudeNext, parseJsonReply } from "@/lib/claude-next";
import type { ClaudeUsage } from "@/lib/claude-lite";

export interface Turn {
  /** Index of the first caption line of this turn. */
  start_index: number;
  /** "Speaker 1", "Speaker 2"… consistent for the same person across turns. */
  speaker: string;
}

export interface SpeakerSplit {
  turns: Turn[];
  /** Best guess at who each speaker is ("the host", "Joe"), when stated in the video. */
  names: Record<string, string>;
}

export const SPLIT_SCHEMA = {
  type: "object",
  properties: {
    turns: {
      type: "array",
      items: {
        type: "object",
        properties: { start_index: { type: "integer" }, speaker: { type: "string" } },
        required: ["start_index", "speaker"],
        additionalProperties: false,
      },
    },
    names: {
      type: "array",
      items: {
        type: "object",
        properties: { speaker: { type: "string" }, name: { type: "string" } },
        required: ["speaker", "name"],
        additionalProperties: false,
      },
    },
  },
  required: ["turns", "names"],
  additionalProperties: false,
} as const;

const SYSTEM = `You split a video's caption lines into speakers. The captions have no speaker labels. Use every clue: a ">>" at the start of a line usually marks a new speaker; a question followed by an answer; greetings and introductions ("thanks for having me", "my guest today is"); people addressing each other by name.

Return turns: the index of the first line of each speaker's turn, with a label "Speaker 1", "Speaker 2" and so on. The same person keeps the same label every time they speak. The first turn starts at index 0. If the whole video is one person talking (a sermon, a lecture, a solo video), return a single turn at index 0 for "Speaker 1".

In names, give a short guess at who each speaker is only when the video says so ("the host", "Joe", "Pastor Mike"). Leave a speaker out of names if nothing in the captions tells you.`;

/** Speaker label for every caption line from a list of turn starts. Pure. */
export function speakersFromTurns(lineCount: number, turns: Turn[]): string[] {
  const sorted = turns
    .filter((t) => Number.isInteger(t.start_index) && t.start_index >= 0 && t.start_index < lineCount && t.speaker)
    .sort((a, b) => a.start_index - b.start_index);
  const out: string[] = new Array(lineCount).fill(sorted[0]?.speaker ?? "Speaker 1");
  for (let i = 0; i < sorted.length; i++) {
    const end = i + 1 < sorted.length ? sorted[i + 1].start_index : lineCount;
    for (let j = sorted[i].start_index; j < end; j++) out[j] = sorted[i].speaker;
  }
  return out;
}

/** Attach a guessed name to the label the author will see ("Speaker 2 (Joe?)"). */
export function labelWithGuess(speaker: string, names: Record<string, string>): string {
  const guess = names[speaker]?.trim();
  return guess ? `${speaker} (${guess.slice(0, 20)}?)`.slice(0, 40) : speaker;
}

export async function splitYoutubeSpeakers(lines: string[]): Promise<{ speakers: string[]; count: number; usage: ClaudeUsage }> {
  const numbered = lines.map((l, i) => `${i}: ${l.replace(/\s+/g, " ").trim()}`).join("\n");
  const res = await callClaudeNext(SYSTEM, `CAPTION LINES:\n${numbered}`, {
    model: "sonnet5", effort: "low", maxTokens: 16000, jsonSchema: SPLIT_SCHEMA as unknown as Record<string, unknown>,
  });
  const out = parseJsonReply<{ turns: Turn[]; names: { speaker: string; name: string }[] }>(res.text);
  const names = Object.fromEntries((out.names ?? []).map((n) => [n.speaker, n.name]));
  const raw = speakersFromTurns(lines.length, out.turns ?? []);
  const speakers = raw.map((s) => labelWithGuess(s, names));
  return { speakers, count: new Set(speakers).size, usage: res.usage };
}
