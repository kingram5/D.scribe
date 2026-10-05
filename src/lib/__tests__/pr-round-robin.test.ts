import { describe, it, expect } from "vitest";
import { nextQuestion, progress, MAX_IN_A_ROW, type RRQuestion, type RRChapter } from "../publisher-ready/round-robin";

const chapters: RRChapter[] = [
  { id: "c1", chapter_number: 1 },
  { id: "c2", chapter_number: 2 },
  { id: "c3", chapter_number: 3 },
];

function q(id: string, chapter_id: string, impact = 3, created = id): RRQuestion {
  return { id, chapter_id, impact, status: "queued", asked_round: null, created_at: created };
}

/** Drive the scheduler to exhaustion, answering every pick; returns the ask order. */
function runAll(chs: RRChapter[], qs: RRQuestion[]): { order: string[]; rounds: number[] } {
  const order: string[] = [];
  const rounds: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const pick = nextQuestion(chs, qs);
    if (!pick) break;
    const row = qs.find((x) => x.id === pick.question.id)!;
    row.status = "answered";
    row.asked_round = pick.round;
    order.push(row.id);
    rounds.push(pick.round);
  }
  return { order, rounds };
}

describe("round-robin interview scheduler", () => {
  it("asks at most 5 in a row per chapter, then moves to the next chapter", () => {
    const qs = [
      ...Array.from({ length: 7 }, (_, i) => q(`a${i}`, "c1", 3, `0${i}`)),
      ...Array.from({ length: 2 }, (_, i) => q(`b${i}`, "c2", 3, `1${i}`)),
      ...Array.from({ length: 6 }, (_, i) => q(`c${i}`, "c3", 3, `2${i}`)),
    ];
    const { order, rounds } = runAll(chapters, qs);
    expect(order).toEqual([
      "a0", "a1", "a2", "a3", "a4", // ch1 round 1 (5)
      "b0", "b1", //                   ch2 round 1 (only 2)
      "c0", "c1", "c2", "c3", "c4", // ch3 round 1 (5)
      "a5", "a6", //                   ch1 round 2 (questions 6-7)
      "c5", //                         ch3 round 2
    ]);
    expect(rounds.slice(0, 12).every((r) => r === 1)).toBe(true);
    expect(rounds.slice(12).every((r) => r === 2)).toBe(true);
  });

  it("never exceeds MAX_IN_A_ROW consecutive picks from one chapter", () => {
    const qs = Array.from({ length: 23 }, (_, i) => q(`x${i}`, "c1", 3, String(i).padStart(3, "0")));
    const { rounds } = runAll([chapters[0]], qs);
    // single chapter: each round holds at most 5, so 23 questions span 5 rounds
    for (let r = 1; r <= 5; r++) {
      expect(rounds.filter((x) => x === r).length).toBeLessThanOrEqual(MAX_IN_A_ROW);
    }
    expect(rounds.length).toBe(23);
  });

  it("asks highest-impact questions first within a chapter", () => {
    const qs = [q("low", "c1", 1, "1"), q("high", "c1", 5, "2"), q("mid", "c1", 3, "3")];
    expect(runAll([chapters[0]], qs).order).toEqual(["high", "mid", "low"]);
  });

  it("skips questions dropped as already covered without counting them toward the 5", () => {
    const qs = Array.from({ length: 6 }, (_, i) => q(`a${i}`, "c1", 3, `0${i}`));
    qs[0].status = "dropped_covered"; // dropped before being asked: no round
    const first = runAll([chapters[0]], qs);
    expect(first.order).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    expect(first.rounds.every((r) => r === 1)).toBe(true);
  });

  it("returns null when nothing is queued", () => {
    expect(nextQuestion(chapters, [])).toBeNull();
    const done = q("z", "c1");
    done.status = "skipped";
    expect(nextQuestion(chapters, [done])).toBeNull();
  });

  it("reports progress", () => {
    const qs = [q("a", "c1"), q("b", "c2"), q("c", "c2")];
    qs[0].status = "answered";
    qs[0].asked_round = 1;
    expect(progress(qs)).toEqual({ remaining: 2, answered: 1, skipped: 0, round: 1, chaptersWithQuestions: 1 });
  });
});
