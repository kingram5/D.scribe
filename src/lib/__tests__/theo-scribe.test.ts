import { describe, expect, it } from "vitest";
import type { BrainstormMessage } from "@/lib/brainstorm-session";
import { emptyNotes } from "@/lib/theo/notes";
import { ingredientsFor } from "@/lib/theo/ingredients";
import { buildRecap, fallbackRecap, recapUserMessage, scribeUserMessage } from "@/lib/theo/scribe";

const u = (content: string): BrainstormMessage => ({ role: "user", content });
const a = (content: string): BrainstormMessage => ({ role: "assistant", content });

const CONVO: BrainstormMessage[] = [
  u("Start the brainstorm session."),
  a("Hey Dana, Theo here. Who are you writing this for?"),
  u("My granddaughter Ruth. She is nine and she never met my mother."),
  a("Take me to your mother's kitchen. What do you see?"),
  u("A yellow table with a burn mark where I set the iron down in 1961. She never sanded it out. She said every house needs one honest scar."),
];

describe("fallbackRecap: the card always exists, even with no model", () => {
  it("counts only the author's words and turns", () => {
    const r = fallbackRecap(CONVO);
    expect(r.exchanges).toBe(2);
    expect(r.words).toBeGreaterThan(30);
    expect(r.pages).toBe(1);
  });
  it("prefers a keeper line for the line of the day", () => {
    expect(fallbackRecap(CONVO, ["every house needs one honest scar"]).lineOfTheDay).toBe("every house needs one honest scar");
  });
  it("ignores the synthetic opening ping", () => {
    expect(fallbackRecap([u("Start the brainstorm session.")]).words).toBe(0);
  });
});

describe("buildRecap", () => {
  it("keeps a verbatim line of the day and builds the handoff from it", () => {
    const { recap, handoff, topic } = buildRecap(
      { captured: ["The burn mark on your mother's yellow table", "Ruth, nine, who never met her"], lineOfTheDay: "She said every house needs one honest scar.", openThread: "why her mother never sanded it out", teaser: "What was your mother's honest scar?", topic: "A grandmother's kitchen stories for Ruth" },
      CONVO,
    );
    expect(recap.lineOfTheDay).toBe("She said every house needs one honest scar.");
    expect(recap.captured).toHaveLength(2);
    expect(handoff).toEqual({ line: "She said every house needs one honest scar.", openThread: "why her mother never sanded it out", nextQuestion: "What was your mother's honest scar?" });
    expect(topic).toBe("A grandmother's kitchen stories for Ruth");
  });

  it("refuses an invented line of the day and falls back to something she really said", () => {
    const { recap } = buildRecap({ lineOfTheDay: "A home is the sum of its honest imperfections." }, CONVO, ["every house needs one honest scar"]);
    expect(recap.lineOfTheDay).toBe("every house needs one honest scar");
  });

  it("survives a junk model response", () => {
    const { recap, handoff, topic } = buildRecap("not json at all", CONVO);
    expect(recap.words).toBeGreaterThan(0);
    expect(recap.captured).toEqual([]);
    expect(handoff.nextQuestion).toBe("");
    expect(topic).toBe("");
  });

  it("strips em dashes from anything shown to the author", () => {
    const { recap } = buildRecap({ captured: ["The iron — 1961"], teaser: "What else — if anything — did she refuse to fix?" }, CONVO);
    expect(recap.captured[0].includes("—")).toBe(false);
    expect(recap.teaser.includes("—")).toBe(false);
  });

  it("counts always come from code, never the model", () => {
    const { recap } = buildRecap({ words: 99999, pages: 400, exchanges: 80 }, CONVO);
    expect(recap.exchanges).toBe(2);
    expect(recap.words).toBeLessThan(200);
  });
});

describe("prompts sent to the scribe", () => {
  it("sends only the recent stretch of the interview, not all of it", () => {
    const long: BrainstormMessage[] = Array.from({ length: 60 }, (_, i) => (i % 2 ? u(`answer ${i}`) : a(`question ${i}?`)));
    const msg = scribeUserMessage(long, emptyNotes(), ingredientsFor("Memoir & Biography"));
    expect(msg).toContain("answer 59");
    expect(msg).not.toContain("answer 11");
    expect(msg).toContain("senses:");
  });
  it("leaves the opening ping out of the recap prompt", () => {
    expect(recapUserMessage(CONVO)).not.toContain("Start the brainstorm session.");
  });
});
