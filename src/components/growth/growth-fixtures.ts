// Made-up numbers for the growth dashboard's dev preview (src/app/dev/growth)
// and its render tests. No real data, no real accounts.

import { summarizeGrowth, type GrowthWindow, type SignupRow, type VisitRow } from "@/lib/growth";
import type { GrowthPayload } from "./GrowthDashboard";

export type GrowthFixture = "full" | "empty" | "no-visits" | "unavailable";

const NOW = new Date("2026-12-20T15:00:00Z");
const DAY = 86_400_000;

function rows(days: GrowthWindow): { visits: VisitRow[]; signups: SignupRow[]; paying: Set<string> } {
  // Daily visit shape per channel over 90 days (deterministic).
  const daily: [string, number][] = [
    ["instagram", 14], ["direct", 11], ["google", 6], ["tiktok", 4], ["chatgpt", 2],
    ["perplexity", 1], ["facebook", 2], ["youtube", 1], ["reddit", 1], ["other", 1], ["bing", 1],
  ];
  const visits: VisitRow[] = [];
  for (let i = 0; i < 26; i++) {
    const day = new Date(NOW.getTime() - i * DAY).toISOString().slice(0, 10);
    for (const [channel, base] of daily) visits.push({ day, channel, visits: base + ((i * 7 + channel.length) % 5) });
  }
  // Sign-ups: [first-visit referrer, utm_source, answer, paying?]
  const people: [string | null, string | null, string, boolean][] = [
    ["https://l.instagram.com/", null, "instagram", true],
    ["https://l.instagram.com/", null, "instagram", false],
    [null, "ig", "instagram", true],
    ["", null, "instagram", false],
    ["", null, "tiktok", false],
    ["", null, "friend", true],
    ["https://www.google.com/", null, "google", true],
    ["https://www.google.com/", null, "google", false],
    ["https://chatgpt.com/", null, "chatgpt", true],
    ["https://www.perplexity.ai/", null, "perplexity", false],
    [null, "tiktok", "tiktok", false],
    ["https://www.youtube.com/", null, "youtube", false],
    ["", null, "podcast", false],
  ];
  const signups: SignupRow[] = [];
  const paying = new Set<string>();
  people.forEach(([referrer, utm, answer, paid], i) => {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    signups.push({
      user_id: id,
      attribution_source: answer,
      referrer: referrer || null,
      null_referrer: referrer === "" ? true : referrer === null && !utm ? null : false,
      utm_source: utm,
      utm_medium: null,
      created_at: new Date(NOW.getTime() - (i * 1.7 + 0.3) * DAY).toISOString(),
    });
    if (paid) paying.add(id);
  });
  void days; // same rows for every window; summarizeGrowth trims to the window
  return { visits, signups, paying };
}

export function growthFixture(kind: GrowthFixture, days: GrowthWindow = 30): GrowthPayload {
  if (kind === "unavailable") {
    return { available: false, reason: "The growth tables are missing or unreadable. Run migration 033_signup_attribution.sql in the Supabase SQL editor." };
  }
  const base = {
    available: true as const,
    generated_at: NOW.toISOString(),
    viewer: "viewer" as const,
    paying_definition: "Paying = on a paid plan right now (an active subscription or a paid tier), not a complimentary partner account. Cancelled accounts count as not paying.",
    vercel_analytics_url: "https://vercel.com/",
  };
  if (kind === "empty") {
    return { ...base, sources: { visits: true, signups: true, paying: true }, summary: summarizeGrowth({ visits: [], signups: [], paying: new Set(), days, countingSince: null, now: NOW }) };
  }
  const r = rows(days);
  if (kind === "no-visits") {
    return { ...base, sources: { visits: false, signups: true, paying: true }, summary: summarizeGrowth({ visits: [], signups: r.signups, paying: r.paying, days, countingSince: null, now: NOW }) };
  }
  return {
    ...base,
    viewer: "admin",
    sources: { visits: true, signups: true, paying: true },
    summary: summarizeGrowth({ visits: r.visits, signups: r.signups, paying: r.paying, days, countingSince: "2026-11-25", now: NOW }),
  };
}
