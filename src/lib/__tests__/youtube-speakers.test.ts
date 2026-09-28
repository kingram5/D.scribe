import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/claude-next", () => ({ callClaudeNext: vi.fn(), parseJsonReply: vi.fn() }));
import { speakersFromTurns, labelWithGuess, splitPrompt } from "../youtube-speakers";

describe("YouTube speaker split (pure parts)", () => {
  it("fills every line from turn starts", () => {
    expect(speakersFromTurns(6, [
      { start_index: 0, speaker: "Speaker 1" },
      { start_index: 2, speaker: "Speaker 2" },
      { start_index: 4, speaker: "Speaker 1" },
    ])).toEqual(["Speaker 1", "Speaker 1", "Speaker 2", "Speaker 2", "Speaker 1", "Speaker 1"]);
  });

  it("ignores out-of-range or unsorted turns and defaults to one speaker", () => {
    expect(speakersFromTurns(3, [{ start_index: 2, speaker: "Speaker 2" }, { start_index: 0, speaker: "Speaker 1" }, { start_index: 99, speaker: "Speaker 3" }]))
      .toEqual(["Speaker 1", "Speaker 1", "Speaker 2"]);
    expect(speakersFromTurns(2, [])).toEqual(["Speaker 1", "Speaker 1"]);
  });

  it("shows a guessed name only when the video gave one, within the 40-char label limit", () => {
    expect(labelWithGuess("Speaker 2", { "Speaker 2": "Joe" })).toBe("Speaker 2 (Joe?)");
    expect(labelWithGuess("Speaker 1", {})).toBe("Speaker 1");
    expect(labelWithGuess("Speaker 2", { "Speaker 2": "a very long description of the host person" }).length).toBeLessThanOrEqual(40);
  });
});

describe("YouTube speaker split prompt", () => {
  it("puts the title and channel ahead of the captions so name spellings come from them", () => {
    const p = splitPrompt(["hey everyone", "welcome"], { title: "Stop Playing With My Name I Robert Madu I Social Dallas", channel: "Social Dallas" });
    expect(p.startsWith("VIDEO TITLE: Stop Playing With My Name I Robert Madu")).toBe(true);
    expect(p).toContain("CHANNEL: Social Dallas");
    expect(p).toContain("0: hey everyone");
  });
  it("is unchanged when no video details are available", () => {
    expect(splitPrompt(["a", "b"], null)).toBe("CAPTION LINES:\n0: a\n1: b");
  });
});
