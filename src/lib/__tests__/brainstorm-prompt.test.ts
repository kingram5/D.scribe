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
    expect(BRAINSTORM_SYSTEM_PROMPT).toMatch(/help them enlarge what they just offered/);
    expect(BRAINSTORM_SYSTEM_PROMPT).toMatch(/Never ask multiple questions/);
    expect(BRAINSTORM_SYSTEM_PROMPT).toMatch(/stay with it and help them expand it/);
    expect(BRAINSTORM_SYSTEM_PROMPT).toMatch(/Do not treat every new detail as a reason to return to the title/);
    expect(BRAINSTORM_SYSTEM_PROMPT).not.toMatch(/If they go broad, help them narrow/);
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
    expect(brainstormTopicAnchorBlock("A book about rest")).toMatch(/explore and expand that thread/);
    expect(brainstormTopicAnchorBlock("A book about rest")).not.toMatch(/then return to the broader theme/);
  });

  it("is what the Claude brainstorm route imports", () => {
    const src = readFileSync(resolve(__dirname, "../../app/api/brainstorm/route.ts"), "utf8");
    expect(src).toMatch(/BRAINSTORM_SYSTEM_PROMPT/);
    expect(src).toMatch(/brainstormGreetingBlock/);
    expect(src).toMatch(/brainstormTopicAnchorBlock/);
    expect(src).not.toMatch(/const SYSTEM_PROMPT =/);
  });
});
