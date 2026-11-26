import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  CHANNEL_GROUPS, CHANNEL_LABELS, VISIT_CHANNELS,
  channelForHost, deriveChannel, groupOf, isVisitChannel, signupChannel, type Channel,
} from "../channels";

// One channel function for both visits and sign-ups (growth dashboard, 2026-11-25).

const ref = (referrer: string) => deriveChannel({ referrer });
const utm = (utmSource: string, referrer = "", utmMedium = "") => deriveChannel({ utmSource, referrer, utmMedium });

describe("utm_source comes first", () => {
  it("maps the platform names and their short forms", () => {
    const cases: [string, Channel][] = [
      ["instagram", "instagram"], ["ig", "instagram"], ["IG", "instagram"],
      ["tiktok", "tiktok"], ["facebook", "facebook"], ["fb", "facebook"],
      ["google", "google"], ["bing", "bing"],
      ["chatgpt.com", "chatgpt"], ["chatgpt", "chatgpt"], ["openai", "chatgpt"],
      ["perplexity", "perplexity"], ["perplexity.ai", "perplexity"], ["gemini", "gemini"],
      ["claude", "claude"], ["claude.ai", "claude"], ["copilot", "copilot"],
      ["youtube", "youtube"], ["reddit", "reddit"], ["linkedin", "linkedin"],
      ["x", "x"], ["twitter", "x"], ["email", "email"], ["newsletter", "email"],
    ];
    for (const [source, want] of cases) expect([source, utm(source)]).toEqual([source, want]);
  });

  it("reads host-like values as hosts (l.instagram.com, www.google.com)", () => {
    expect(utm("l.instagram.com")).toBe("instagram");
    expect(utm("www.google.com")).toBe("google");
    expect(utm("https://chatgpt.com/")).toBe("chatgpt");
  });

  it("wins over the referrer, and anything unknown is Other (not the referrer)", () => {
    expect(utm("instagram", "https://www.google.com/search")).toBe("instagram");
    expect(utm("spring-flyer", "https://www.google.com/search")).toBe("other");
    expect(utm("notchatgpt.com")).toBe("other");
  });

  it("an unknown source with utm_medium=email counts as Email", () => {
    expect(utm("convertkit", "", "email")).toBe("email");
    expect(utm("convertkit", "", "social")).toBe("other");
  });

  it("blank utm_source falls through to the referrer", () => {
    expect(utm("   ", "https://www.reddit.com/r/writing")).toBe("reddit");
  });
});

describe("referrer host, exact or dot-suffix", () => {
  it("maps every platform host in the brief", () => {
    const cases: [string, Channel][] = [
      ["https://www.instagram.com/", "instagram"], ["https://l.instagram.com/", "instagram"],
      ["https://www.tiktok.com/@x", "tiktok"],
      ["https://www.facebook.com/", "facebook"], ["https://l.facebook.com/l.php", "facebook"], ["https://m.facebook.com/", "facebook"],
      ["https://www.google.com/", "google"], ["https://google.co.uk/", "google"], ["https://www.google.com.au/", "google"], ["https://www.google.de/", "google"],
      ["https://www.bing.com/search", "bing"],
      ["https://chatgpt.com/", "chatgpt"], ["https://chat.openai.com/", "chatgpt"],
      ["https://www.perplexity.ai/search", "perplexity"],
      ["https://gemini.google.com/app", "gemini"],
      ["https://claude.ai/chat/1", "claude"],
      ["https://copilot.microsoft.com/", "copilot"],
      ["https://www.youtube.com/watch", "youtube"], ["https://m.youtube.com/", "youtube"], ["https://youtu.be/x", "youtube"],
      ["https://www.reddit.com/r/x", "reddit"], ["https://out.reddit.com/", "reddit"],
      ["https://www.linkedin.com/feed", "linkedin"], ["https://lnkd.in/abc", "linkedin"],
      ["https://x.com/someone", "x"], ["https://t.co/abc", "x"], ["https://twitter.com/", "x"],
      ["https://www.threads.net/", "social_other"],
      ["https://duckduckgo.com/", "search_other"],
      ["https://mail.google.com/", "email"], ["https://outlook.live.com/", "email"],
    ];
    for (const [r, want] of cases) expect([r, ref(r)]).toEqual([r, want]);
  });

  it("AI and webmail on google.com are not Google search; other Google subdomains are not search either", () => {
    expect(ref("https://gemini.google.com/")).toBe("gemini");
    expect(ref("https://mail.google.com/mail/u/0")).toBe("email");
    expect(ref("https://accounts.google.com/")).toBe("other");
    expect(ref("https://sites.google.com/view/x")).toBe("other");
  });

  it("never matches look-alikes or substrings", () => {
    for (const r of [
      "https://notchatgpt.com/", "https://chatgpt.com.evil.io/", "https://claude.ai.example.org/",
      "https://perplexity.ai-tools.net/", "https://myinstagram.com/", "https://instagram.com.fake.net/",
      "https://google.evil.com/", "https://fakegoogle.com/", "https://www.google.com.evil.net/",
      "https://notreddit.com/", "https://xt.co/", "https://box.com/",
    ]) expect([r, ref(r)]).toEqual([r, "other"]);
  });

  it("no referrer is Direct; our own pages are Direct; garbage is Other", () => {
    expect(ref("")).toBe("direct");
    expect(deriveChannel({})).toBe("direct");
    expect(deriveChannel({ referrer: null, utmSource: null })).toBe("direct");
    expect(ref("https://www.d-scribe.app/pricing")).toBe("direct");
    expect(ref("https://d-scribe.app/")).toBe("direct");
    expect(ref("not a url")).toBe("other");
    expect(ref("javascript:alert(1)")).toBe("other");
    expect(ref("https://d-scribe.app.evil.com/")).toBe("other");
  });

  it("reads Android app referrers", () => {
    expect(ref("android-app://com.google.android.gm/")).toBe("email");
    expect(ref("android-app://com.google.android.googlequicksearchbox/")).toBe("google");
    expect(ref("android-app://com.instagram.android/")).toBe("instagram");
    expect(ref("android-app://com.example.unknown/")).toBe("other");
  });

  it("channelForHost: null only for our own host", () => {
    expect(channelForHost("www.d-scribe.app")).toBeNull();
    expect(channelForHost("WWW.INSTAGRAM.COM.")).toBe("instagram");
    expect(channelForHost("")).toBe("other");
  });
});

describe("sign-ups use the same function", () => {
  it("buckets the stored first-visit fields; nothing captured is Not captured", () => {
    expect(signupChannel({ utm_source: null, referrer: null, null_referrer: null })).toBe("unknown");
    expect(signupChannel({ utm_source: null, referrer: null, null_referrer: true })).toBe("direct");
    expect(signupChannel({ utm_source: null, referrer: "https://l.instagram.com/", null_referrer: false })).toBe("instagram");
    expect(signupChannel({ utm_source: "tiktok", referrer: "https://www.google.com/", null_referrer: false })).toBe("tiktok");
    expect(signupChannel({ utm_source: "x", utm_medium: null, referrer: null, null_referrer: true })).toBe("x");
  });
});

describe("groups", () => {
  it("every channel (and Not captured) has a label and exactly one group", () => {
    const all: Channel[] = [...VISIT_CHANNELS, "unknown"];
    for (const c of all) {
      expect(CHANNEL_LABELS[c]).toBeTruthy();
      expect(CHANNEL_GROUPS.filter((g) => g.channels.includes(c))).toHaveLength(1);
    }
    expect(CHANNEL_GROUPS.flatMap((g) => g.channels).sort()).toEqual([...all].sort());
  });

  it("puts AI assistants together and Not captured with Direct", () => {
    expect(groupOf("perplexity").id).toBe("ai");
    expect(groupOf("copilot").id).toBe("ai");
    expect(groupOf("unknown").id).toBe("direct");
    expect(groupOf("bing").id).toBe("search");
    expect(groupOf("linkedin").id).toBe("social");
  });

  it("isVisitChannel accepts only stored channel keys", () => {
    expect(isVisitChannel("instagram")).toBe(true);
    expect(isVisitChannel("unknown")).toBe(false);
    expect(isVisitChannel("Instagram")).toBe(false);
    expect(isVisitChannel(3)).toBe(false);
  });
});

describe("migration 033 allows exactly these channels", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/033_signup_attribution.sql"), "utf8");
  const listAfter = (marker: string) => {
    const at = sql.indexOf(marker);
    if (at < 0) return [];
    const m = sql.slice(at).match(/in \(([^)]*)\)/); // [^)] already spans newlines
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  };

  it("table check and function check both match VISIT_CHANNELS", () => {
    const want = [...VISIT_CHANNELS].sort();
    expect(listAfter("add constraint visit_channel_daily_channel_check").sort()).toEqual(want);
    expect(listAfter("create or replace function public.bump_visit_channel").sort()).toEqual(want);
  });

  it("is anonymous and locked down: no user or IP column, RLS on, no policies, service role only", () => {
    const table = sql.slice(sql.indexOf("create table if not exists public.visit_channel_daily"));
    const cols = table.slice(0, table.indexOf(");"));
    expect(cols).not.toMatch(/user_id|ip\b|ip_|email|url|referrer/i);
    expect(sql).toMatch(/alter table public\.visit_channel_daily enable row level security;/);
    expect(sql).not.toMatch(/create policy[^;]*visit_channel_daily/i);
    expect(sql).toMatch(/revoke execute on function public\.bump_visit_channel\(text\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant {1,2}execute on function public\.bump_visit_channel\(text\) to service_role;/);
    expect(sql).toMatch(/security definer set search_path = public/);
    expect(sql).toMatch(/\(now\(\) at time zone 'utc'\)::date/);
  });

  it("the rollback drops the function and both tables", () => {
    const rb = fs.readFileSync(path.join(__dirname, "../../../supabase/rollbacks/033_signup_attribution_rollback.sql"), "utf8");
    expect(rb).toMatch(/drop function if exists public\.bump_visit_channel\(text\);/);
    expect(rb).toMatch(/drop table if exists public\.visit_channel_daily;/);
    expect(rb).toMatch(/drop table if exists public\.user_attribution;/);
  });
});
