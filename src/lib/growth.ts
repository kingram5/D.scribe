// Growth dashboard numbers (Kyle 2026-11-25: "which platforms are working and
// which aren't"). Pure aggregation, no I/O, so every rule here is unit-tested;
// /api/admin/growth does the reads and hands the rows in.
//
// Per channel group, for the chosen window (7 / 30 / 90 UTC days):
//   visits    anonymous first visits (visit_channel_daily)
//   sign-ups  accounts that answered the signup question in the window,
//             bucketed by THEIR first visit (same channel function as visits)
//   said      sign-ups in the window whose own answer names this channel
//   paying    of those sign-ups, how many are on a paid plan now
//   rates     visit -> sign-up and sign-up -> paying, or null ("—") when the
//             base is zero or the ratio is not meaningful yet

import { ATTRIBUTION_OPTIONS } from "@/lib/attribution";
import { CHANNEL_GROUPS, CHANNEL_LABELS, groupOf, isVisitChannel, signupChannel, type Channel } from "@/lib/channels";

export const GROWTH_WINDOWS = [7, 30, 90] as const;
export type GrowthWindow = (typeof GROWTH_WINDOWS)[number];

export function parseWindow(raw: string | null | undefined): GrowthWindow {
  const n = Number(raw);
  return (GROWTH_WINDOWS as readonly number[]).includes(n) ? (n as GrowthWindow) : 30;
}

/** "Paying" for the dashboard: an active subscription or a paid tier, never a complimentary partner account. */
export const PAYING_DEFINITION = "Paying = on a paid plan right now (an active subscription or a paid tier), not a complimentary partner account. Cancelled accounts count as not paying.";

export function isPaying(b: { tier: string | null; stripe_subscription_id?: string | null; comp_partner?: boolean | null }): boolean {
  if (b.comp_partner === true) return false;
  return Boolean(b.stripe_subscription_id) || (!!b.tier && b.tier !== "free");
}

/** Self-reported answers that name a channel group (the rest: friend, podcast, directory, other). */
const ANSWER_GROUP: Record<string, string> = {
  instagram: "instagram", tiktok: "tiktok", facebook: "facebook",
  google: "search", bing: "search",
  chatgpt: "ai", claude: "ai", perplexity: "ai", gemini: "ai",
  youtube: "youtube", reddit: "reddit", social: "social",
};

export interface VisitRow { day: string; channel: string; visits: number }
export interface SignupRow {
  user_id: string;
  attribution_source: string;
  referrer: string | null;
  null_referrer: boolean | null;
  utm_source: string | null;
  utm_medium: string | null;
  created_at: string;
}

export interface ChannelCounts { visits: number; signups: number; said: number; paid: number }

export interface GrowthChannelRow extends ChannelCounts {
  id: string;
  label: string;
  visitToSignupPct: number | null;
  signupToPaidPct: number | null;
  /** Sub-rows for multi-channel groups (AI assistants, search, other social, direct) when two or more have activity. */
  breakdown: (ChannelCounts & { channel: Channel; label: string })[];
}

export interface GrowthSummary {
  days: GrowthWindow;
  startDay: string;
  endDay: string;
  totals: ChannelCounts & { visitToSignupPct: number | null; signupToPaidPct: number | null };
  /** Groups with any activity, most sign-ups first. */
  channels: GrowthChannelRow[];
  /** Groups with no visits and no sign-ups in the window (listed, not tabled). */
  quiet: string[];
  /** What new accounts said, every answer with at least one, most first. */
  answers: { source: string; label: string; count: number; paid: number }[];
  /** Sign-ups per UTC week (Monday) by group, newest week first. */
  weekly: { week: string; visits: number; signups: number; byGroup: Record<string, number> }[];
  /** Group ids for the weekly table's columns: the top groups by sign-ups in the window. */
  weeklyGroups: { id: string; label: string }[];
  countingSince: string | null;
}

const DAY = 86_400_000;
export const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** Monday of the UTC week containing the YYYY-MM-DD day or ISO timestamp. */
export function weekOf(dayOrIso: string): string {
  const d = new Date(dayOrIso.length === 10 ? `${dayOrIso}T00:00:00Z` : dayOrIso);
  const back = (d.getUTCDay() + 6) % 7;
  return utcDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)));
}

/** First UTC day of a window that ends today (inclusive). */
export function windowStart(days: number, now: Date = new Date()): string {
  return utcDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY));
}

/** Percentage to one decimal, or null when the ratio means nothing (no base, or more out than in). */
export function rate(part: number, whole: number): number | null {
  if (!whole || part > whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

const zero = (): ChannelCounts => ({ visits: 0, signups: 0, said: 0, paid: 0 });
const answerLabel = (v: string) => ATTRIBUTION_OPTIONS.find((o) => o.value === v)?.label ?? v;

export function summarizeGrowth(input: {
  visits: VisitRow[];
  signups: SignupRow[];
  paying: ReadonlySet<string>;
  days: GrowthWindow;
  countingSince: string | null;
  now?: Date;
}): GrowthSummary {
  const now = input.now ?? new Date();
  const startDay = windowStart(input.days, now);
  const endDay = utcDay(now);
  const startIso = `${startDay}T00:00:00.000Z`;

  const byChannel = new Map<Channel, ChannelCounts>();
  const byGroup = new Map<string, ChannelCounts>();
  const at = <K>(m: Map<K, ChannelCounts>, k: K) => { let v = m.get(k); if (!v) { v = zero(); m.set(k, v); } return v; };
  const totals = zero();

  const weeks = new Map<string, { visits: number; signups: number; byGroup: Record<string, number> }>();
  const week = (w: string) => { let v = weeks.get(w); if (!v) { v = { visits: 0, signups: 0, byGroup: {} }; weeks.set(w, v); } return v; };
  // Every week in the window gets a row, so a quiet week reads as 0, not as missing.
  for (let w = weekOf(startDay); w <= weekOf(endDay); w = utcDay(new Date(Date.parse(`${w}T00:00:00Z`) + 7 * DAY))) week(w);

  for (const v of input.visits) {
    if (v.day < startDay || v.day > endDay || !isVisitChannel(v.channel)) continue;
    const n = Math.max(0, Math.floor(Number(v.visits) || 0));
    at(byChannel, v.channel).visits += n;
    at(byGroup, groupOf(v.channel).id).visits += n;
    totals.visits += n;
    week(weekOf(v.day)).visits += n;
  }

  const answers = new Map<string, { count: number; paid: number }>();
  for (const s of input.signups) {
    if (s.created_at < startIso) continue;
    const paid = input.paying.has(s.user_id);
    const ch = signupChannel(s);
    const g = groupOf(ch).id;
    const c = at(byChannel, ch), gc = at(byGroup, g);
    c.signups++; gc.signups++; totals.signups++;
    if (paid) { c.paid++; gc.paid++; totals.paid++; }

    const saidGroup = ANSWER_GROUP[s.attribution_source];
    if (saidGroup) { at(byGroup, saidGroup).said++; totals.said++; }
    const a = answers.get(s.attribution_source) ?? { count: 0, paid: 0 };
    a.count++; if (paid) a.paid++;
    answers.set(s.attribution_source, a);

    const wk = week(weekOf(s.created_at));
    wk.signups++;
    wk.byGroup[g] = (wk.byGroup[g] ?? 0) + 1;
  }

  // Sub-rows only when at least two channels in the group have activity; a
  // single sub-row would just repeat the group's own numbers.
  const breakdownFor = (list: readonly Channel[]) => {
    const parts = list
      .map((ch) => ({ channel: ch, label: CHANNEL_LABELS[ch], ...(byChannel.get(ch) ?? zero()) }))
      .filter((b) => b.visits || b.signups);
    return parts.length > 1 ? parts : [];
  };

  const channels: GrowthChannelRow[] = [];
  const quiet: string[] = [];
  for (const g of CHANNEL_GROUPS) {
    const c = byGroup.get(g.id) ?? zero();
    if (!c.visits && !c.signups && !c.said) { quiet.push(g.label); continue; }
    channels.push({
      id: g.id,
      label: g.label,
      ...c,
      visitToSignupPct: rate(c.signups, c.visits),
      signupToPaidPct: rate(c.paid, c.signups),
      breakdown: breakdownFor(g.channels),
    });
  }
  const order = new Map(CHANNEL_GROUPS.map((g, i) => [g.id, i]));
  channels.sort((a, b) => b.signups - a.signups || b.visits - a.visits || b.said - a.said || (order.get(a.id)! - order.get(b.id)!));

  const weeklyGroups = channels.filter((c) => c.signups > 0).slice(0, 4).map((c) => ({ id: c.id, label: c.label }));

  return {
    days: input.days,
    startDay,
    endDay,
    totals: { ...totals, visitToSignupPct: rate(totals.signups, totals.visits), signupToPaidPct: rate(totals.paid, totals.signups) },
    channels,
    quiet,
    answers: [...answers.entries()]
      .map(([source, v]) => ({ source, label: answerLabel(source), count: v.count, paid: v.paid }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    weekly: [...weeks.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([w, v]) => ({ week: w, ...v })),
    weeklyGroups,
    countingSince: input.countingSince,
  };
}
