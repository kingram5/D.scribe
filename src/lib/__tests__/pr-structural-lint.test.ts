import { describe, it, expect } from "vitest";
import { lintStructure, bookRepeats } from "../publisher-ready/structural-lint";

const flat = Array.from({ length: 20 }, (_, i) => `The committee met again on day ${i} and discussed the budget at length.`).join(" ");

const varied = [
  "No.",
  "I said it twice before anyone in the room looked up from the spreadsheet my father had printed on the back of old invoices, because paper was money and money was the one thing he never wasted.",
  "Then silence.",
  "My mother laughed first.",
  "It was the kind of laugh you only hear at funerals and weddings, too loud and a little bit afraid of itself, and it filled the kitchen until the dog barked.",
  "We ate.",
  "Nobody mentioned the bank letter again until Sunday, when my brother found it under the fruit bowl and read it out loud in his radio voice.",
  "Dad took it from him.",
  "He folded it into quarters, then eighths.",
  "Then he put it in his shirt pocket, patted it once, and asked who wanted more potatoes.",
  "I did.",
  "Everyone did, apparently, because the bowl was empty before the question finished traveling around the table and landing back on him like a dare.",
  "That was 1994.",
  "The farm lasted three more winters.",
  "He never said the word bankrupt, not once, not even at the auction, where he stood by the gate shaking hands with the men who bought his tractors.",
].join(" ");

describe("structural linter", () => {
  it("flags flat sentence rhythm", () => {
    const r = lintStructure(flat);
    expect(r.flags.some((f) => f.kind === "flat_rhythm")).toBe(true);
    expect(r.rhythmVariation).toBeLessThan(0.35);
  });

  it("does not flag varied human rhythm", () => {
    const r = lintStructure(varied);
    expect(r.flags.some((f) => f.kind === "flat_rhythm")).toBe(false);
    expect(r.rhythmVariation).toBeGreaterThan(0.45);
  });

  it("flags em dashes and comma splices", () => {
    const r = lintStructure("I walked into the barn that morning, I was ready for anything. The rain came — hard.");
    expect(r.flags.some((f) => f.kind === "em_dash")).toBe(true);
    expect(r.flags.some((f) => f.kind === "comma_splice")).toBe(true);
  });

  it("flags repeated paragraph openers", () => {
    const text = ["I remember the barn.", "I remember the rain.", "I remember the auction."].join("\n\n");
    expect(lintStructure(text).flags.some((f) => f.kind === "repeated_opening")).toBe(true);
  });
});

describe("book-wide repetition index", () => {
  it("finds content phrases reused across chapters and ignores function-word runs", () => {
    const ch3 = "Her walls came crashing down when she saw the letter. And then I was sure.";
    const flags = bookRepeats(ch3, {
      "Chapter 1": "By the end of the night his walls came crashing down too.",
      "Chapter 2": "And then I was sure it was over.",
    });
    expect(flags.map((f) => f.span)).toContain("walls came crashing down");
    expect(flags.some((f) => f.span === "and then i was")).toBe(false);
    expect(flags[0].message).toContain("Chapter 1");
  });
});
