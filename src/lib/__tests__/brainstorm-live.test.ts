import { describe, expect, it } from "vitest";
import {
  LIVE_DEFAULT_VOICE,
  LIVE_MAX_HISTORY_MESSAGES,
  buildLiveGreetingFacts,
  buildLiveInstructions,
  buildLiveOpeningAppend,
  firstRealUserMessage,
  groupTranscriptFragments,
  inkLiveSessionCost,
  isLiveInitPing,
  isLiveVoice,
  liveDurationSeconds,
  messagesToLiveInput,
  messagesToSeedFragments,
  type LiveTranscriptFragment,
} from "@/lib/brainstorm-live";
import { BRAINSTORM_SYSTEM_PROMPT } from "@/lib/brainstorm-prompt";
import { INK_PER_LIVE_MINUTE } from "@/lib/ink";
import type { BrainstormMessage } from "@/lib/brainstorm-session";

describe("buildLiveOpeningAppend", () => {
  it("asks Theo to speak first on a fresh session and continue on resume", () => {
    expect(buildLiveOpeningAppend({ firstName: "Kyle", title: "", audience: "" }, false)).toMatch(/Greet Kyle as Theo/);
    expect(buildLiveOpeningAppend(null, true)).toMatch(/Continue the interview/);
  });
});

describe("GPT-Live voice helpers", () => {
  it("accepts only the allowlisted Live voices", () => {
    expect(isLiveVoice(LIVE_DEFAULT_VOICE)).toBe(true);
    expect(isLiveVoice("meridian")).toBe(true);
    expect(isLiveVoice("ballad")).toBe(true);
    expect(isLiveVoice("finley")).toBe(false);
    expect(isLiveVoice("alloy")).toBe(false);
  });
});

describe("buildLiveInstructions", () => {
  it("copies the Haiku interviewer prompt and keeps Live voice policies", () => {
    const prompt = buildLiveInstructions({});
    expect(prompt).toContain(BRAINSTORM_SYSTEM_PROMPT);
    expect(prompt).toMatch(/Technical Human Expression Organizer/);
    expect(prompt).toMatch(/CRITICAL: Maintain the overarching book topic/);
    expect(prompt).toMatch(/What do you mean by that\?/);
    expect(prompt).toMatch(/If they go broad, help them narrow/);
    expect(prompt).toMatch(/NEVER use em dashes \(—\)/);
    expect(prompt).toMatch(/Backchannel policy:/);
    expect(prompt).toMatch(/Interruption policy:/);
    expect(prompt).toMatch(/Delegation policy:/);
    expect(prompt).toMatch(/Ask one question at a time/);
  });

  it("adds an opening greeting only on a fresh session", () => {
    const greeting = buildLiveGreetingFacts({
      fullName: "Kyle Parks",
      projectTitle: "The Ledger",
      projectAudience: "Money & Finance",
    });
    const fresh = buildLiveInstructions({ greeting, isResume: false });
    expect(fresh).toMatch(/OPENING GREETING — This is the very first message/);
    expect(fresh).toMatch(/Shape \(adapt, don't recite\)/);
    expect(fresh).toMatch(/Kyle/);
    expect(fresh).toMatch(/The Ledger/);

    const resume = buildLiveInstructions({ greeting, isResume: true, topicAnchor: "tithing" });
    expect(resume).not.toMatch(/OPENING GREETING/);
    expect(resume).toMatch(/TOPIC ANCHOR — The user's book is about: "tithing"/);
    expect(resume).toMatch(/resumed conversation/);
  });

  it("appends audience specialization when provided", () => {
    const prompt = buildLiveInstructions({
      audienceBlock: "\n\nAUDIENCE SPECIALIZATION — this project's target audience is \"Memoir & Biography\".",
    });
    expect(prompt).toMatch(/Memoir & Biography/);
  });
});

describe("messagesToLiveInput", () => {
  it("drops the init ping and maps roles to Live content types", () => {
    const messages: BrainstormMessage[] = [
      { role: "user", content: "Start the brainstorm session." },
      { role: "user", content: "A book about rest" },
      { role: "assistant", content: "Who is it for?" },
    ];
    expect(isLiveInitPing(messages[0]!.content)).toBe(true);
    expect(firstRealUserMessage(messages)?.content).toBe("A book about rest");
    const input = messagesToLiveInput(messages);
    expect(input).toHaveLength(2);
    expect(input[0]).toMatchObject({
      role: "user",
      content: [{ type: "input_text", text: "A book about rest" }],
    });
    expect(input[1]).toMatchObject({
      role: "assistant",
      content: [{ type: "output_text", text: "Who is it for?" }],
    });
  });

  it("trims from the middle once the message cap is exceeded", () => {
    const messages: BrainstormMessage[] = [];
    for (let i = 0; i < LIVE_MAX_HISTORY_MESSAGES + 5; i++) {
      messages.push({ role: "user", content: `u${i}` });
      messages.push({ role: "assistant", content: `a${i}` });
    }
    const input = messagesToLiveInput(messages);
    expect(input.length).toBeLessThanOrEqual(LIVE_MAX_HISTORY_MESSAGES);
    expect(input[0]?.content[0]?.text).toBe("u0");
    expect(input.at(-1)?.content[0]?.text).toBe(`a${LIVE_MAX_HISTORY_MESSAGES + 4}`);
  });
});

describe("messagesToSeedFragments", () => {
  it("reconstitutes resume history and does not merge with live start_ms=0 captions", () => {
    const messages: BrainstormMessage[] = [
      { role: "user", content: "Start the brainstorm session." },
      { role: "user", content: "A book about rest" },
      { role: "assistant", content: "Who is it for?" },
    ];
    const seed = messagesToSeedFragments(messages);
    expect(groupTranscriptFragments(seed)).toEqual([
      { role: "user", content: "A book about rest" },
      { role: "assistant", content: "Who is it for?" },
    ]);
    expect(seed.every((fragment) => fragment.end_ms < 0)).toBe(true);

    const live: LiveTranscriptFragment = {
      speaker: "assistant",
      delta: "What changed?",
      start_ms: 0,
      end_ms: 400,
    };
    expect(groupTranscriptFragments([...seed, live])).toEqual([
      { role: "user", content: "A book about rest" },
      { role: "assistant", content: "Who is it for?" },
      { role: "assistant", content: "What changed?" },
    ]);
  });
});

describe("groupTranscriptFragments", () => {
  it("merges nearby same-speaker fragments and keeps first-appearance order", () => {
    const fragments: LiveTranscriptFragment[] = [
      { speaker: "assistant", delta: "What are you ", start_ms: 0, end_ms: 400 },
      { speaker: "assistant", delta: "writing?", start_ms: 400, end_ms: 800 },
      { speaker: "user", delta: "A memoir", start_ms: 2000, end_ms: 2600 },
    ];
    expect(groupTranscriptFragments(fragments)).toEqual([
      { role: "assistant", content: "What are you writing?" },
      { role: "user", content: "A memoir" },
    ]);
  });

  it("lets overlapping speech grow independent rows", () => {
    const fragments: LiveTranscriptFragment[] = [
      { speaker: "assistant", delta: "Tell me more", start_ms: 0, end_ms: 2000 },
      { speaker: "user", delta: "wait —", start_ms: 500, end_ms: 900 },
      { speaker: "assistant", delta: " about that.", start_ms: 2100, end_ms: 2600 },
    ];
    const grouped = groupTranscriptFragments(fragments);
    expect(grouped).toEqual([
      { role: "assistant", content: "Tell me more about that." },
      { role: "user", content: "wait —" },
    ]);
  });

  it("starts a new row after a long gap from the same speaker", () => {
    const fragments: LiveTranscriptFragment[] = [
      { speaker: "assistant", delta: "First question.", start_ms: 0, end_ms: 500 },
      { speaker: "user", delta: "Answer.", start_ms: 800, end_ms: 1200 },
      { speaker: "assistant", delta: "Second question.", start_ms: 4000, end_ms: 4500 },
    ];
    expect(groupTranscriptFragments(fragments, 1500)).toEqual([
      { role: "assistant", content: "First question." },
      { role: "user", content: "Answer." },
      { role: "assistant", content: "Second question." },
    ]);
  });
});

describe("inkLiveSessionCost", () => {
  it("bills per second without rounding up to the next minute", () => {
    expect(INK_PER_LIVE_MINUTE).toBe(7);
    expect(inkLiveSessionCost(60)).toBe(7);
    expect(inkLiveSessionCost(30)).toBe(3.5);
    expect(inkLiveSessionCost(1)).toBe(0.1167);
    expect(inkLiveSessionCost(0)).toBe(0);
  });

  it("caps a session at one hour", () => {
    expect(inkLiveSessionCost(10_000)).toBe(7 * 60);
  });

  it("reads seconds from a Live usage object", () => {
    expect(liveDurationSeconds({ seconds: 12.5 }, 3)).toBe(12.5);
    expect(liveDurationSeconds({ duration_seconds: 9 }, 3)).toBe(9);
    expect(liveDurationSeconds(null, 4)).toBe(4);
  });
});

describe("BrainstormLiveChat live studio wiring", () => {
  it("seeds resume captions and offers reconnect after a background close", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(resolve(__dirname, "../../components/upload/BrainstormLiveChat.tsx"), "utf8");
    expect(src).toMatch(/messagesToSeedFragments\(resumeMessages\)/);
    expect(src).toMatch(/setBackgroundPaused\(true\)/);
    expect(src).toMatch(/Tap Reconnect when you return/);
    expect(src).toMatch(/retryAction === "start" && backgroundPaused \? "Reconnect"/);
    expect(src).toMatch(/document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
    const visibility = src.slice(src.indexOf("const onVisibilityChange"), src.indexOf("const beginSession"));
    expect(visibility).toMatch(/track\.stop\(\)/);
    expect(visibility).toMatch(/closeLiveSession\(\)/);
  });

  it("opens with Live instructions plus commentary and a GPT-Live voice picker", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(resolve(__dirname, "../../components/upload/BrainstormLiveChat.tsx"), "utf8");
    expect(src).toMatch(/type: "session.instructions.append"/);
    expect(src).toMatch(/type: "session.commentary.append"/);
    expect(src).toMatch(/LIVE_VOICES\.map/);
    expect(src).toMatch(/aria-label="Live studio voice"/);
    expect(src).toMatch(/session.input_audio.mute/);
    expect(src).toMatch(/session.input_audio.unmute/);
  });
});
