import { describe, expect, it } from "vitest";
import { isEnrichmentCandidate, isVerifiedEnrichment, verifiedEnrichments } from "../enrichment-policy";
import { generatePrompt } from "../prompts/generate";
import type { Enrichment } from "@/types";
const text = "A sourced historical observation for the chapter.";
const candidate = { quote_text: text, source_author: "United States Holocaust Memorial Museum", source_title: "The history of Nazi propaganda", source_type: "article", included: true };
const sources = [{ text, attribution: candidate.source_author, source_title: candidate.source_title, source_url: "https://encyclopedia.ushmm.org/history" }];
describe("optional enrichment policy", () => {
  it.each(["Adolf Hitler", "Adolph Hitler", "Hitler, Adolf", "A. Hitler", "Hitler", "Der F\u00fchrer", "Adolf H\u200bitler", "Joseph Goebbels"])("rejects primary propaganda attribution %s even with grounding", (author) => {
    const item = { ...candidate, source_author: author };
    expect(isVerifiedEnrichment(item, [{ ...sources[0], attribution: author }])).toBe(false);
  });
  it.each(["Mein Kampf", "Mein-Kampf (1925)", "My Struggle", "Mein Kampf, Chapter 11", "Adolf Hitler's Mein Kampf"])("screens source-only attribution %s", (source_title) => {
    const item = { ...candidate, source_type: "book", source_author: "A translator", source_title };
    expect(isVerifiedEnrichment(item, [{ ...sources[0], attribution: item.source_author, source_title }])).toBe(false);
  });
  it("allows source-grounded neutral historical discussion, including references to Hitler and Mein Kampf", () => {
    const item = { ...candidate, quote_text: "Hitler used Mein Kampf to spread Nazi propaganda.", source_title: "Mein Kampf: Hitler's Manifesto" };
    expect(isVerifiedEnrichment(item, [{ ...sources[0], text: item.quote_text, source_title: item.source_title }])).toBe(true);
  });
  it.each(["", "Unknown", "Anonymous", "Historian", "N/A"])("omits unknown attribution %s without fallback", (source_author) => {
    expect(isVerifiedEnrichment({ ...candidate, source_author }, [{ ...sources[0], attribution: source_author }])).toBe(false);
  });
  it("omits memory-only, misattributed, modified, malformed or unverifiable candidates", () => {
    expect(isVerifiedEnrichment(candidate, [])).toBe(false);
    expect(isVerifiedEnrichment({ ...candidate, source_author: "Someone else" }, sources)).toBe(false);
    expect(isVerifiedEnrichment({ ...candidate, quote_text: text.replace("sourced", "invented") }, sources)).toBe(false);
    expect(isVerifiedEnrichment(candidate, [{ ...sources[0], source_url: "javascript:alert(1)" }])).toBe(false);
    expect(isEnrichmentCandidate({ ...candidate, source_type: "paraphrased" })).toBe(false);
    expect(verifiedEnrichments([candidate, { ...candidate, source_author: "Hitler" }], sources)).toEqual([candidate]);
  });
  it("preserves deliberate user manuscript quotes and offers no propaganda through the generation prompt", () => {
    const authored = 'My historical analysis quotes Hitler from Mein Kampf: "The original source text."';
    const prompt = generatePrompt({ chapterNumber: 1, chapterTitle: "History", chapterSummary: "Critical historical discussion", transcriptExcerpts: authored, keyPoints: [], previousChapters: [], targetWords: 1000, audience: "General" as never, freedomInstruction: "Stay faithful", enrichments: [{ ...candidate, quote_text: "An unsolicited inspirational quote", source_author: "Adolf Hitler", source_title: "Mein Kampf" } as Enrichment] });
    expect(prompt).toContain(authored); expect(prompt).not.toContain("An unsolicited inspirational quote"); expect(prompt).not.toContain("ENRICHMENT QUOTES");
  });
});
