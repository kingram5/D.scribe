import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_OPTIONS, ATTRIBUTION_VALUES, FIRST_TOUCH_KEY,
  buildFirstTouch, classifyAiReferrer, parseFirstTouch, passiveChannel, recordFirstTouch,
  shuffledOptions, summarizeAttribution, utcWeekStart, validateAnswer, type AttributionRow,
} from "../attribution";
import { isAppPath } from "../app-routes";

// Phase 3b: "How did you hear about us?" plus first-visit attribution.

describe("answer options", () => {
  it("are the plan's 13 options with Social split into Instagram, TikTok, Facebook and Other social (16)", () => {
    expect(ATTRIBUTION_OPTIONS.map((o) => o.label)).toEqual([
      "ChatGPT", "Claude", "Perplexity", "Gemini", "Google search", "Bing", "Reddit", "YouTube", "Podcast",
      "Friend or colleague", "Instagram", "TikTok", "Facebook", "Other social (X, LinkedIn)", "Product Hunt or a directory", "Other",
    ]);
  });

  it("shuffle keeps every option, always puts Other last, and really reorders the rest", () => {
    const orders = new Set<string>();
    let seed = 7;
    const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 0; i < 200; i++) {
      const o = shuffledOptions(rng);
      expect(o).toHaveLength(16);
      expect(new Set(o.map((x) => x.value))).toEqual(new Set(ATTRIBUTION_VALUES));
      expect(o[15].value).toBe("other");
      orders.add(o.map((x) => x.value).join(","));
    }
    expect(orders.size).toBeGreaterThan(150);
    // Math.random default path as well
    expect(shuffledOptions().at(-1)?.value).toBe("other");
    // extreme random sources
    expect(shuffledOptions(() => 0).at(-1)?.value).toBe("other");
    expect(shuffledOptions(() => 0.9999999).at(-1)?.value).toBe("other");
  });
});

describe("the answer is required", () => {
  it("rejects a missing, empty or unknown source", () => {
    for (const bad of [undefined, null, "", "myspace", "TikTok", 3, { value: "chatgpt" }]) expect(validateAnswer(bad, undefined).ok).toBe(false);
  });

  it("accepts each option; free text only for Other (optional, trimmed, capped)", () => {
    for (const v of ATTRIBUTION_VALUES) expect(validateAnswer(v, undefined).ok).toBe(true);
    expect(validateAnswer("google", "ignored")).toEqual({ ok: true, source: "google", detail: null });
    expect(validateAnswer("other", "  a   friend's newsletter ")).toEqual({ ok: true, source: "other", detail: "a friend's newsletter" });
    expect(validateAnswer("other", "")).toEqual({ ok: true, source: "other", detail: null });
    const long = validateAnswer("other", "x".repeat(500));
    expect(long.ok && long.detail?.length).toBe(200);
  });
});

describe("first-visit capture", () => {
  const now = new Date("2026-11-14T15:00:00Z");

  it("keeps the landing path plus utm_* only, and the referrer's origin/path only", () => {
    const t = buildFirstTouch(
      "https://www.d-scribe.app/pricing?utm_source=chatgpt.com&utm_medium=referral&email=a@b.co&code=secret#top",
      "https://www.google.com/search?q=private+words",
      now,
    )!;
    expect(t.landing_url).toBe("/pricing?utm_source=chatgpt.com&utm_medium=referral");
    expect(t.referrer).toBe("https://www.google.com/search");
    expect(t.null_referrer).toBe(false);
    expect(t.utm).toEqual({ utm_source: "chatgpt.com", utm_medium: "referral" });
    expect(t.captured_at).toBe(now.toISOString());
  });

  it("flags a first visit with no referrer, distinct from nothing captured", () => {
    const t = buildFirstTouch("https://www.d-scribe.app/", "", now)!;
    expect(t.referrer).toBe("");
    expect(t.null_referrer).toBe(true);
    expect(passiveChannel({ ai_referrer: null, referrer: null, utm_source: null, null_referrer: true })).toBe("none");
    expect(passiveChannel({ ai_referrer: null, referrer: null, utm_source: null, null_referrer: null })).toBe("not captured");
  });

  it("persists once: later visits never overwrite the first touch", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const opts = { analyticsDeclined: false, isAppPath, now };
    const first = recordFirstTouch(storage, "https://www.d-scribe.app/vs/squibler?utm_source=reddit", "https://www.reddit.com/r/writing/comments/x", opts)!;
    expect(first.landing_url).toBe("/vs/squibler?utm_source=reddit");
    recordFirstTouch(storage, "https://www.d-scribe.app/pricing", "https://www.d-scribe.app/vs/squibler", opts);
    expect(parseFirstTouch(store.get(FIRST_TOUCH_KEY))).toEqual(first);
  });

  it("skips the signed-in app and auth callbacks, and clears on declined analytics", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    expect(recordFirstTouch(storage, "https://www.d-scribe.app/dashboard", "", { analyticsDeclined: false, isAppPath, now })).toBeNull();
    expect(recordFirstTouch(storage, "https://www.d-scribe.app/auth/callback?code=x", "", { analyticsDeclined: false, isAppPath, now })).toBeNull();
    expect(store.size).toBe(0);
    recordFirstTouch(storage, "https://www.d-scribe.app/", "", { analyticsDeclined: false, isAppPath, now });
    expect(store.has(FIRST_TOUCH_KEY)).toBe(true);
    expect(recordFirstTouch(storage, "https://www.d-scribe.app/", "", { analyticsDeclined: true, isAppPath, now })).toBeNull();
    expect(store.has(FIRST_TOUCH_KEY)).toBe(false);
  });

  it("parses what the browser sends back defensively", () => {
    expect(parseFirstTouch("not json")).toBeNull();
    expect(parseFirstTouch({ landing_url: "https://evil.example/x" })).toBeNull();
    const p = parseFirstTouch({ landing_url: "/", referrer: "javascript:alert(1)", utm: { utm_source: 5, utm_medium: "x".repeat(300) }, captured_at: "nope" })!;
    expect(p.referrer).toBe("");
    expect(p.null_referrer).toBe(true);
    expect(p.utm.utm_source).toBeUndefined();
    expect(p.utm.utm_medium).toHaveLength(200);
    expect(p.captured_at).toBe("");
  });
});

describe("AI referrer tagging", () => {
  it("tags the five assistants by exact host or subdomain", () => {
    expect(classifyAiReferrer("https://chatgpt.com/", null)).toBe("chatgpt");
    expect(classifyAiReferrer("https://chat.openai.com/c/123", null)).toBe("chatgpt");
    expect(classifyAiReferrer("https://www.perplexity.ai/search", null)).toBe("perplexity");
    expect(classifyAiReferrer("https://claude.ai/chat/abc", null)).toBe("claude");
    expect(classifyAiReferrer("https://gemini.google.com/app", null)).toBe("gemini");
    expect(classifyAiReferrer("https://copilot.microsoft.com/", null)).toBe("copilot");
  });

  it("does not match look-alikes or plain Google", () => {
    for (const r of ["https://notchatgpt.com/", "https://chatgpt.com.evil.io/", "https://claude.ai.example.org/", "https://www.google.com/search", "https://perplexity.ai-tools.net/"]) {
      expect(classifyAiReferrer(r, null)).toBeNull();
    }
    expect(classifyAiReferrer("not a url", null)).toBeNull();
  });

  it("falls back to utm_source (ChatGPT appends utm_source=chatgpt.com)", () => {
    expect(classifyAiReferrer("", "chatgpt.com")).toBe("chatgpt");
    expect(classifyAiReferrer(null, "Perplexity")).toBe("perplexity");
    expect(classifyAiReferrer(null, "newsletter")).toBeNull();
  });
});

describe("admin summary", () => {
  const row = (over: Partial<AttributionRow>): AttributionRow => ({
    user_id: Math.random().toString(36), attribution_source: "google", attribution_detail: null, landing_url: "/", referrer: null,
    null_referrer: true, utm_source: null, ai_referrer: null, created_at: "2026-11-10T12:00:00Z", ...over,
  });

  it("buckets weeks on Monday 00:00 UTC", () => {
    expect(utcWeekStart("2026-11-16T00:00:00Z")).toBe("2026-11-16"); // Monday
    expect(utcWeekStart("2026-11-15T23:59:00Z")).toBe("2026-11-09"); // Sunday night belongs to the prior week
  });

  it("counts by source, conversion to paid, and the self-reported vs passive AI gap", () => {
    const rows = [
      row({ user_id: "a", attribution_source: "chatgpt", ai_referrer: "chatgpt", referrer: "https://chatgpt.com/" , null_referrer: false }),
      row({ user_id: "b", attribution_source: "chatgpt" }),
      row({ user_id: "c", attribution_source: "google", referrer: "https://www.google.com/", null_referrer: false }),
      row({ user_id: "d", attribution_source: "other", attribution_detail: "church newsletter" }),
    ];
    const s = summarizeAttribution(rows, new Set(["a", "c"]), 12, new Date("2026-11-14T00:00:00Z"));
    expect(s.total).toBe(4);
    expect(s.paidTotal).toBe(2);
    expect(s.bySource[0]).toMatchObject({ source: "chatgpt", count: 2, paid: 1, conversionPct: 50 });
    expect(s.ai).toMatchObject({ selfReported: 2, passive: 1, both: 1, selfReportedPct: 50, passivePct: 25 });
    expect(s.selfVsPassive).toContainEqual({ source: "google", passive: "google", count: 1 });
    expect(s.selfVsPassive).toContainEqual({ source: "chatgpt", passive: "ai:chatgpt", count: 1 });
    expect(s.otherDetails).toEqual(["church newsletter"]);
    expect(s.byWeek).toEqual([{ week: "2026-11-09", total: 4, bySource: { chatgpt: 2, google: 1, other: 1 } }]);
  });
});

describe("migration 033 matches the code", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/033_signup_attribution.sql"), "utf8");
  const listIn = (col: string) => {
    const m = sql.match(new RegExp(`${col}[^;]*?in \\(([^)]*)\\)`, "s"));
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  };

  it("allows exactly the app's answer values", () => {
    expect(listIn("add constraint user_attribution_attribution_source_check check \\(attribution_source").sort()).toEqual([...ATTRIBUTION_VALUES].sort());
  });

  it("re-runs cleanly: the named answer check is dropped before it is re-added", () => {
    const drop = sql.indexOf("drop constraint if exists user_attribution_attribution_source_check");
    expect(drop).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(sql.indexOf("add constraint user_attribution_attribution_source_check"));
    // no inline check left on the column (it would survive a re-run with the old list)
    expect(sql).toMatch(/attribution_source text not null,/);
  });

  it("allows exactly the AI engines the classifier returns", () => {
    expect(listIn("ai_referrer text check \\(ai_referrer is null or ai_referrer").sort()).toEqual(["chatgpt", "claude", "copilot", "gemini", "perplexity"]);
  });

  it("turns RLS on with a read-own policy only, and keeps the rollback out of migrations/", () => {
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/for select using \(\(select auth\.uid\(\)\) = user_id\)/);
    expect(sql).not.toMatch(/for (insert|update|delete|all)/i);
    expect(sql).toMatch(/references auth\.users\(id\) on delete cascade/);
    expect(fs.existsSync(path.join(__dirname, "../../../supabase/rollbacks/033_signup_attribution_rollback.sql"))).toBe(true);
  });
});
