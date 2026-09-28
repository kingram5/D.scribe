import { describe, it, expect } from "vitest";
import { chunkTranscript } from "../chunker";
import {
  labeledRange, labeledText, speakerOfQuote, ownerOfQuotes, stripSpeakerTags, allSpeakersLabeled,
  authorOnlyText, speakersIn, speakerTag, type LabeledTranscript,
} from "../speakers";

const seg = (text: string, speaker: string) => ({ start: 0, end: 1, text, speaker });

const segments = [
  seg("Welcome back to the show. Today my guest is Pastor Mike.", "Speaker 0"),
  seg("Thanks for having me. When I was nine my father lost the farm and we moved to Tulsa.", "Speaker 1"),
  seg("That is a hard thing for a kid. I remember my own first job at the diner.", "Speaker 0"),
];
const full_text = segments.map((s) => s.text).join("\n\n");

const unlabeled: LabeledTranscript = { full_text, segments, speaker_map: null };
const labeled: LabeledTranscript = {
  full_text,
  segments,
  speaker_map: {
    "Speaker 0": { role: "author" },
    "Speaker 1": { role: "other", name: "Pastor Mike", relationship: "my pastor" },
  },
};

describe("speaker labels: unlabeled transcripts are untouched", () => {
  it("labeledRange equals the chunker's plain text for every chunk", () => {
    for (const c of chunkTranscript(full_text, 12, 3)) {
      expect(labeledRange(unlabeled, c.startWord, c.wordCount)).toBe(c.text);
    }
    expect(labeledText(unlabeled)).toBe(full_text);
  });

  it("owns nothing and keeps every word for the voice baseline", () => {
    expect(speakerOfQuote(unlabeled, "my father lost the farm")).toBeNull();
    expect(authorOnlyText(unlabeled)).toBe(full_text);
  });

  it("falls back to plain text when segments no longer line up with full_text", () => {
    const edited = { ...labeled, full_text: full_text + " extra words typed later" };
    const words = edited.full_text.split(/\s+/).filter(Boolean);
    expect(labeledRange(edited, 0, words.length)).toBe(words.join(" "));
  });
});

describe("speaker labels: labeled transcripts", () => {
  it("tags each change of speaker", () => {
    const text = labeledText(labeled);
    expect(text.startsWith("[Author]: Welcome back")).toBe(true);
    expect(text).toContain("\n\n[Pastor Mike, my pastor]: Thanks for having me.");
    expect(text).toContain("\n\n[Author]: That is a hard thing");
  });

  it("tags a mid-transcript chunk from its first word", () => {
    const words = full_text.split(/\s+/).filter(Boolean);
    const start = words.indexOf("father");
    expect(labeledRange(labeled, start, 4)).toBe("[Pastor Mike, my pastor]: father lost the farm");
  });

  it("finds a quote's owner from the segments, never from the model", () => {
    expect(speakerOfQuote(labeled, "my father lost the farm and we moved to Tulsa")?.name).toBe("Pastor Mike");
    expect(speakerOfQuote(labeled, "[Pastor Mike]: my father lost the farm")?.name).toBe("Pastor Mike");
    expect(speakerOfQuote(labeled, "I remember my own first job at the diner")?.role).toBe("author");
    expect(speakerOfQuote(labeled, "a sentence nobody ever said out loud")).toBeNull();
  });

  it("rolls quotes up to one owner or mixed", () => {
    expect(ownerOfQuotes(labeled, ["my father lost the farm"])).toEqual({ role: "other", name: "Pastor Mike" });
    expect(ownerOfQuotes(labeled, ["my own first job at the diner"])).toEqual({ role: "author", name: null });
    expect(ownerOfQuotes(labeled, ["my father lost the farm", "my own first job at the diner"]).role).toBe("mixed");
    expect(ownerOfQuotes(labeled, []).role).toBeNull();
  });

  it("keeps only the author's lines for the voice baseline", () => {
    const text = authorOnlyText(labeled);
    expect(text).toContain("diner");
    expect(text).not.toContain("Tulsa");
  });

  it("knows when every speaker has a label", () => {
    expect(allSpeakersLabeled(labeled)).toBe(true);
    expect(allSpeakersLabeled({ ...labeled, speaker_map: { "Speaker 0": { role: "author" } } })).toBe(false);
    expect(allSpeakersLabeled(unlabeled)).toBe(false);
    expect(speakersIn(segments)).toEqual(["Speaker 0", "Speaker 1"]);
  });

  it("strips tags a model copied into a quote", () => {
    expect(stripSpeakerTags("[Author]: I remember the diner")).toBe("I remember the diner");
    expect(speakerTag(undefined)).toBe("[Author]");
  });
});

describe("speaker label gate", () => {
  it("only blocks analysis when the flag is on, there are speaker segments, and nothing is confirmed", async () => {
    const { vi } = await import("vitest");
    const { needsSpeakerLabels } = await import("../speakers");
    const t = { segments: [seg("hello there", "Speaker 0")], speakers_confirmed_at: null };
    vi.stubEnv("NEXT_PUBLIC_SPEAKER_LABELS", "");
    expect(needsSpeakerLabels(t)).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SPEAKER_LABELS", "true");
    expect(needsSpeakerLabels(t)).toBe(true);
    expect(needsSpeakerLabels({ ...t, speakers_confirmed_at: "2026-09-27T00:00:00Z" })).toBe(false);
    expect(needsSpeakerLabels({ segments: [], speakers_confirmed_at: null })).toBe(false); // pasted text
    vi.unstubAllEnvs();
  });
});
