import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  BRAINSTORM_INIT_PING,
  BRAINSTORM_SYSTEM_PROMPT,
  brainstormGreetingBlock,
  brainstormGreetingFacts,
  brainstormTopicAnchorBlock,
} from "@/lib/brainstorm-prompt";

describe("shared brainstorm interviewer prompt", () => {
  it("keeps the Haiku identity, steering, and language rules", () => {
    expect(BRAINSTORM_INIT_PING).toBe("Start the brainstorm session.");
    expect(BRAINSTORM_SYSTEM_PROMPT).toMatch(/Technical Human Expression Organizer/);
    expect(BRAINSTORM_SYSTEM_PROMPT).toMatch(/not to lecture or generate content/);
    expect(BRAINSTORM_SYSTEM_PROMPT).toMatch(/Never ask multiple questions/);
    expect(BRAINSTORM_SYSTEM_PROMPT).toMatch(/If they go broad, help them narrow/);
    expect(BRAINSTORM_SYSTEM_PROMPT).toMatch(/never let a sub-topic become the new subject/);
    expect(BRAINSTORM_SYSTEM_PROMPT).toMatch(/No "Not X\. Rather, Y\." inversions/);
  });

  it("builds the same opening greeting and topic anchor the Claude studio uses", () => {
    const facts = brainstormGreetingFacts({
      fullName: "Kyle Parks",
      projectTitle: "The Ledger",
      projectAudience: "Money & Finance",
    });
    const greeting = brainstormGreetingBlock(facts);
    expect(greeting).toMatch(/OPENING GREETING — This is the very first message of the session/);
    expect(greeting).toMatch(/Shape \(adapt, don't recite\): "Hey Kyle/);
    expect(greeting).toMatch(/The Ledger/);
    expect(brainstormTopicAnchorBlock("A book about rest")).toMatch(
      /TOPIC ANCHOR — The user's book is about: "A book about rest"/,
    );
  });

  it("is what the Claude brainstorm route imports", () => {
    const src = readFileSync(resolve(__dirname, "../../app/api/brainstorm/route.ts"), "utf8");
    expect(src).toMatch(/BRAINSTORM_SYSTEM_PROMPT/);
    expect(src).toMatch(/brainstormGreetingBlock/);
    expect(src).toMatch(/brainstormTopicAnchorBlock/);
    expect(src).not.toMatch(/const SYSTEM_PROMPT =/);
  });
});
