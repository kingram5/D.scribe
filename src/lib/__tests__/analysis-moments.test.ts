import { describe, expect, it } from "vitest";
import { selectAnalysisMoments, analysisGuidanceBlock, normalizeExcerpt } from "../analysis-moments";
import type { Transcript } from "@/types";

const passage = "I remember the first time I learned what leadership meant because that afternoon changed how I listened to people in my team.";
function transcript(text = passage, extra: Partial<Transcript> = {}): Transcript {
  return { id: "tx1", project_id: "p1", audio_upload_id: "audio1", full_text: text, segments: [], speaker_count: 1, word_count: text.split(" ").length, created_at: "2026-10-05", ...extra };
}

describe("Analysis author moments", () => {
  it("uses actual source text, deduplicates, and caps the set", () => {
    const text = Array.from({ length: 40 }, (_, i) => `${passage} Moment ${i} was unique and important.`).join(" ");
    const cards = selectAnalysisMoments([transcript(text), transcript(text, { id: "tx2" })]);
    expect(cards).toHaveLength(8);
    expect(new Set(cards.map(c => c.excerpt)).size).toBe(8);
    expect(cards.every(c => normalizeExcerpt(text).includes(c.excerpt))).toBe(true);
  });
  it("keeps other speakers attributed and ignores Theo's interviewer turns", () => {
    const cards = selectAnalysisMoments([transcript(`${passage} ${passage} ${passage}`, {
      segments: [
        { text: passage, speaker: "Author", start: 0, end: 10 },
        { text: passage, speaker: "Interviewer", start: 10, end: 20 },
        { text: `${passage} Pastor speaking.`, speaker: "Guest", start: 20, end: 30 },
      ],
      full_text: `${passage} ${passage} ${passage} Pastor speaking.`,
      speaker_map: { Author: { role: "author" }, Interviewer: { role: "other", name: "T.H.E.O." }, Guest: { role: "other", name: "Pastor Mike" } },
    })]);
    expect(cards.map(c => c.speaker)).toEqual(["Your words", "Pastor Mike"]);
    expect(cards[1].is_author).toBe(false);
  });
  it("doesn't invent speaker ownership when segments drift from edited text", () => {
    const cards = selectAnalysisMoments([transcript(passage, { segments: [{ text: "Old text", speaker: "Guest", start: 0, end: 1 }], speaker_map: { Guest: { role: "other", name: "Mike" } } })]);
    expect(cards[0].excerpt).toBe(passage);
    expect(cards[0].speaker).toBe("From your transcript");
    expect(cards[0].is_author).toBe(false);
  });
  it("invalidates a saved card identity when the source passage changes", () => {
    const original = selectAnalysisMoments([transcript()])[0];
    expect(selectAnalysisMoments([transcript()])[0].id).toBe(original.id);
    expect(selectAnalysisMoments([transcript(`${passage} Extra detail.`)])[0].id).not.toBe(original.id);
  });
  it("passes included context and clarification to the writer, while honoring exclusions", () => {
    const card = selectAnalysisMoments([transcript()])[0];
    const included = analysisGuidanceBlock([{ ...card, importance: "essential", context: "I apologized the next day.", clarification_answer: "My manager was Sarah." }]);
    expect(included).toContain("ESSENTIAL");
    expect(included).toContain("I apologized the next day.");
    expect(included).toContain("My manager was Sarah.");
    const excluded = analysisGuidanceBlock([{ ...card, importance: "exclude", context: "PRIVATE DETAIL", clarification_answer: "PRIVATE NAME" }]);
    expect(excluded).toContain("LEAVE OUT");
    expect(excluded).not.toContain("PRIVATE DETAIL");
    expect(excluded).not.toContain("PRIVATE NAME");
    expect(analysisGuidanceBlock([])).toBe("");
  });
  it("handles short and empty inputs without fabricated cards", () => {
    expect(selectAnalysisMoments([transcript("Hello")])).toEqual([]);
    expect(selectAnalysisMoments([])).toEqual([]);
  });
});
