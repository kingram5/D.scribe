import { describe, it, expect } from "vitest";
import robots from "@/app/robots";
import { fitDescription, sentences, MAX_DESCRIPTION } from "../seo";
import { VS_PAGES } from "../vs-pages";

describe("robots.txt", () => {
  const rules = robots().rules;
  const list = Array.isArray(rules) ? rules : [rules];
  const star = list.find((r) => r.userAgent === "*")!;
  const named = list.find((r) => Array.isArray(r.userAgent))!;

  it("names every AI crawler from the SEO/GEO plan", () => {
    for (const bot of ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "anthropic-ai", "PerplexityBot", "Google-Extended", "Bingbot", "CCBot", "Applebot-Extended"]) {
      expect(named.userAgent).toContain(bot);
    }
  });

  it("repeats the * disallows in the named group (a bot obeys only its most specific group)", () => {
    expect(named.disallow).toEqual(star.disallow);
    expect(named.disallow).toEqual(expect.arrayContaining(["/api/", "/dashboard", "/project/"]));
  });

  it("never blocks the public /partners page", () => {
    for (const d of [star.disallow, named.disallow].flat()) expect("/partners".startsWith(String(d))).toBe(false);
  });
});

describe("fitDescription", () => {
  it("keeps whole sentences under the limit", () => {
    const out = fitDescription(["a".repeat(100) + ".", "b".repeat(80) + ".", "c".repeat(20) + "."]);
    expect(out.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    expect(out).toBe("a".repeat(100) + ". " + "c".repeat(20) + ".");
  });

  it("cuts one over-long sentence at a word boundary with an ellipsis", () => {
    const out = fitDescription([Array(60).fill("word").join(" ") + "."]);
    expect(out.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });

  it("splits sentences", () => {
    expect(sentences("One. Two? Three!")).toEqual(["One.", "Two?", "Three!"]);
  });

  it("every /vs page description fits a search result", () => {
    for (const p of VS_PAGES) {
      const d = fitDescription([...sentences(p.verdict), `An honest side-by-side of D.scribe and ${p.competitor} on price, input, and output.`]);
      expect(d.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
      expect(d.length).toBeGreaterThan(50);
    }
  });
});
