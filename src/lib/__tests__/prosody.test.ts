import { describe, it, expect } from "vitest";
import {
  computeUtteranceEmphasis,
  chunkEmphasis,
  quoteMatchesEmphasis,
  relevanceFromDelivery,
  deliveryPromptBlock,
  tokenizeWords,
} from "../prosody";
import { chunkTranscript } from "../chunker";
import { TranscriptSegment } from "@/types";

// Helper: build an utterance with a given pace by computing end from word count
function utt(
  text: string,
  start: number,
  wordsPerSec: number,
  speaker = "Speaker 0"
): TranscriptSegment {
  const words = tokenizeWords(text).length;
  return { start, end: start + words / wordsPerSec, text, speaker };
}

const FAST = 3.0; // baseline speaking pace
const SLOW = 1.5; // half speed = deliberate emphasis

function buildTranscript(): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let t = 0;
  // 6 fast baseline utterances
  for (let i = 0; i < 6; i++) {
    const s = utt(
      `This is ordinary filler content number ${i} moving along at a regular clip with nothing special happening here at all.`,
      t,
      FAST
    );
    segments.push(s);
    t = s.end + 0.1; // tight gaps
  }
  // The money line: slow, after a long dramatic pause
  const money = utt(
    "Grace is not a reward for the righteous it is a rescue for the broken.",
    t + 2.4,
    SLOW
  );
  segments.push(money);
  t = money.end + 0.1;
  // More fast filler
  for (let i = 0; i < 3; i++) {
    const s = utt(
      `And then we continue with more ordinary transitional material item ${i} nothing remarkable in the delivery of this stretch.`,
      t,
      FAST
    );
    segments.push(s);
    t = s.end + 0.1;
  }
  return segments;
}

describe("computeUtteranceEmphasis", () => {
  it("ranks a slow, pause-preceded utterance above fast filler", () => {
    const segments = buildTranscript();
    const emphases = computeUtteranceEmphasis(segments);
    const money = emphases[6];
    const fillerMax = Math.max(
      ...emphases.filter((_, i) => i !== 6).map((e) => e.emphasis)
    );
    expect(money.emphasis).toBeGreaterThan(0.5);
    expect(money.emphasis).toBeGreaterThan(fillerMax);
    expect(money.slowness).toBeGreaterThan(0.5);
    expect(money.pauseWeight).toBeGreaterThan(0.9);
  });

  it("detects repeated phrases as emphasis", () => {
    const refrain = "the goal is not perfection the goal is direction";
    const segments: TranscriptSegment[] = [
      utt(`Opening remarks about the day and the weather and the schedule ahead of us.`, 0, FAST),
      utt(`Remember this because ${refrain} and that changes everything for you.`, 10, FAST),
      utt(`Some unrelated middle content that stands entirely on its own two feet here.`, 20, FAST),
      utt(`As I said before ${refrain} and I will keep saying it.`, 30, FAST),
    ];
    const emphases = computeUtteranceEmphasis(segments);
    expect(emphases[1].repetition).toBe(1);
    expect(emphases[3].repetition).toBe(1);
    expect(emphases[0].repetition).toBe(0);
    expect(emphases[2].repetition).toBe(0);
  });

  it("uses per-speaker pace baselines", () => {
    // Speaker 1 is naturally slow; their normal pace shouldn't read as emphasis
    const segments: TranscriptSegment[] = [
      utt("Host talks quickly here with plenty of words in a short span always.", 0, FAST),
      utt("Guest speaks at their own natural unhurried baseline pace as they always do.", 10, SLOW, "Speaker 1"),
      utt("Host continues quickly again with more rapid fire delivery as usual today.", 20, FAST),
      utt("Guest continues at the same natural unhurried baseline with no change at all.", 30, SLOW, "Speaker 1"),
    ];
    const emphases = computeUtteranceEmphasis(segments);
    // Guest's normal-for-them pace = near-zero slowness against their own median
    expect(emphases[1].slowness).toBeLessThan(0.1);
    expect(emphases[3].slowness).toBeLessThan(0.1);
  });

  it("aligns word ranges with full_text tokenization", () => {
    const segments = buildTranscript();
    const emphases = computeUtteranceEmphasis(segments);
    const fullText = segments.map((s) => s.text).join("\n\n");
    const totalWords = tokenizeWords(fullText).length;
    expect(emphases[emphases.length - 1].wordEnd).toBe(totalWords);
    // Ranges are contiguous and non-overlapping
    for (let i = 1; i < emphases.length; i++) {
      expect(emphases[i].wordStart).toBe(emphases[i - 1].wordEnd);
    }
  });

  it("returns empty for empty segments (text-paste imports)", () => {
    expect(computeUtteranceEmphasis([])).toEqual([]);
  });
});

describe("chunkEmphasis + chunker integration", () => {
  it("surfaces the emphasized utterance in its chunk's top list", () => {
    const segments = buildTranscript();
    const emphases = computeUtteranceEmphasis(segments);
    const fullText = segments.map((s) => s.text).join("\n\n");
    const chunks = chunkTranscript(fullText); // single chunk at this size
    const delivery = chunkEmphasis(
      emphases,
      chunks[0].startWord,
      chunks[0].startWord + chunks[0].wordCount
    );
    expect(delivery.topUtterances.length).toBeGreaterThan(0);
    expect(delivery.topUtterances[0].text).toContain("rescue for the broken");
  });

  it("returns flat emphasis for ranges with no utterances", () => {
    const delivery = chunkEmphasis([], 0, 100);
    expect(delivery.mean).toBe(0);
    expect(delivery.topUtterances).toEqual([]);
  });
});

describe("quoteMatchesEmphasis + relevanceFromDelivery", () => {
  const segments = buildTranscript();
  const emphases = computeUtteranceEmphasis(segments);
  const delivery = chunkEmphasis(emphases, 0, 10_000);

  it("matches a verbatim quote to an emphasized moment", () => {
    expect(
      quoteMatchesEmphasis(
        "Grace is not a reward for the righteous, it is a rescue for the broken.",
        delivery.topUtterances
      )
    ).toBe(true);
  });

  it("rejects short fragments and unrelated quotes", () => {
    expect(quoteMatchesEmphasis("grace", delivery.topUtterances)).toBe(false);
    expect(
      quoteMatchesEmphasis(
        "Completely unrelated sentence about taxes and paperwork filing deadlines.",
        delivery.topUtterances
      )
    ).toBe(false);
  });

  it("promotes delivery-backed key points and keeps baseline otherwise", () => {
    expect(
      relevanceFromDelivery(
        ["Grace is not a reward for the righteous it is a rescue for the broken"],
        delivery
      )
    ).toBe(0.95);
    expect(
      relevanceFromDelivery(["Something about ordinary filler content moving along"], delivery)
    ).toBe(0.8);
    expect(relevanceFromDelivery(["anything"], { mean: 0, max: 0, topUtterances: [] })).toBe(0.7);
  });
});

describe("deliveryPromptBlock", () => {
  it("describes signals for emphasized moments", () => {
    const segments = buildTranscript();
    const emphases = computeUtteranceEmphasis(segments);
    const delivery = chunkEmphasis(emphases, 0, 10_000);
    const block = deliveryPromptBlock(delivery);
    expect(block).toContain("DELIVERY ANALYSIS");
    expect(block).toContain("rescue for the broken");
    expect(block).toMatch(/slowed down|paused/);
  });

  it("returns empty string when nothing is notable", () => {
    expect(deliveryPromptBlock({ mean: 0, max: 0, topUtterances: [] })).toBe("");
  });
});
