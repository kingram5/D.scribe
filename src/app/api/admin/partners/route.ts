import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requirePartnerAdmin } from "@/lib/partner-admin";
import {
  type Partner,
  createPartnerPromotionCode,
  grantCompPremium,
  revokeCompPremium,
  setPromotionCodeActive,
} from "@/lib/partners";
import { normalizeCode, normalizeSlug, payableCents, suggestSlugAndCode, PARTNER_BONUS_INK, PARTNER_DISCOUNT_PERCENT } from "@/lib/partner-rules";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.d-scribe.app").replace(/\/$/, "");

/** The note Kyle sends a creator once they're approved. Nothing here sends it. */
function welcomeMessage(p: Pick<Partner, "name" | "slug" | "code">) {
  const first = p.name.split(/\s+/)[0];
  return [
    `Hey ${first}, you're in as a D.Scribe partner.`,
    ``,
    `Your link: ${site()}/r/${p.slug}`,
    `Your code: ${p.code}`,
    ``,
    `Anyone who signs up through your link or code gets ${PARTNER_BONUS_INK} free Ink to start writing, plus ${PARTNER_DISCOUNT_PERCENT}% off their first month. You get 30% of their plan payments for their first 12 months.`,
    ``,
    `Sign in at ${site()}/partner with this email to see your numbers, set up payouts, and use your free Premium account. Terms: ${site()}/legal/partners`,
  ].join("\n");
}

async function statsFor(ids: string[]) {
  const supabase = createServerClient();
  if (ids.length === 0) return new Map<string, { clicks: number; signups: number; paying: number; earned: number; payable: number }>();
  const [{ data: clicks }, { data: refs }, { data: comms }] = await Promise.all([
    supabase.from("partner_clicks").select("partner_id, clicks").in("partner_id", ids),
    supabase.from("referrals").select("partner_id, first_paid_at").in("partner_id", ids),
    supabase.from("partner_commissions").select("partner_id, commission_cents, status, available_at, payout_id").in("partner_id", ids),
  ]);
  const out = new Map<string, { clicks: number; signups: number; paying: number; earned: number; payable: number }>();
  for (const id of ids) {
    const c = (comms ?? []).filter((r) => r.partner_id === id);
    out.set(id, {
      clicks: (clicks ?? []).filter((r) => r.partner_id === id).reduce((s, r) => s + (r.clicks as number), 0),
      signups: (refs ?? []).filter((r) => r.partner_id === id).length,
      paying: (refs ?? []).filter((r) => r.partner_id === id && r.first_paid_at).length,
      earned: c.filter((r) => r.status !== "void").reduce((s, r) => s + r.commission_cents, 0),
      payable: payableCents(c),
    });
  }
  return out;
}

// GET /api/admin/partners — every partner and application, with numbers.
export async function GET(req: NextRequest) {
  const { error } = await requirePartnerAdmin(req, true);
  if (error) return error;
  const { data, error: dbErr } = await createServerClient().from("partners").select("*").order("created_at", { ascending: false });
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  const partners = (data ?? []) as Partner[];
  const stats = await statsFor(partners.map((p) => p.id));
  return NextResponse.json({
    partners: partners.map((p) => ({ ...p, stats: stats.get(p.id), suggested: p.slug ? null : suggestSlugAndCode(p.name) })),
  });
}

type Action =
  | { action: "approve"; id: string; slug: string; code: string }
  | { action: "decline" | "pause" | "resume"; id: string }
  | { action: "invite"; name: string; email: string; slug: string; code: string };

async function activate(p: Partner, slugRaw: unknown, codeRaw: unknown) {
  const slug = normalizeSlug(slugRaw), code = normalizeCode(codeRaw);
  if (!slug || !code) return { error: "Link name needs 2-32 letters/numbers/dashes; code needs 3-24 letters/numbers." };
  const supabase = createServerClient();
  const { data: clash } = await supabase.from("partners").select("id").or(`slug.eq.${slug},code.eq.${code}`).neq("id", p.id).limit(1);
  if (clash && clash.length > 0) return { error: "That link name or code is already taken." };

  let promoId: string;
  try {
    promoId = await createPartnerPromotionCode({ id: p.id, slug, code });
  } catch (err) {
    logger.error("Creating partner promotion code failed", { route: "/api/admin/partners", meta: { partner: p.id }, error: err });
    return { error: `Stripe wouldn't create code ${code}: ${(err as Error).message}` };
  }
  const { data: updated, error } = await supabase
    .from("partners")
    .update({ slug, code, status: "active", stripe_promotion_code_id: promoId, approved_at: new Date().toISOString() })
    .eq("id", p.id).select("*").single();
  if (error) {
    await setPromotionCodeActive(promoId, false);
    return { error: error.message };
  }
  const partner = updated as Partner;
  if (partner.user_id) await grantCompPremium(partner.user_id);
  return { partner, message: welcomeMessage(partner) };
}

// POST /api/admin/partners — approve, decline, pause, resume, invite.
export async function POST(req: NextRequest) {
  const { error } = await requirePartnerAdmin(req, true);
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as Action;
  const supabase = createServerClient();

  if (body.action === "invite") {
    const name = String(body.name ?? "").trim().slice(0, 80);
    const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });
    const { data: row, error: insErr } = await supabase.from("partners").insert({ name, email, status: "pending", source: "invite" }).select("*").single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
    const res = await activate(row as Partner, body.slug, body.code);
    if ("error" in res) {
      await supabase.from("partners").delete().eq("id", (row as Partner).id);
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    return NextResponse.json(res);
  }

  const { data: found } = await supabase.from("partners").select("*").eq("id", (body as { id?: string }).id ?? "").maybeSingle();
  if (!found) return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  const p = found as Partner;

  switch (body.action) {
    case "approve": {
      if (p.status !== "pending") return NextResponse.json({ error: `Already ${p.status}` }, { status: 409 });
      const res = await activate(p, body.slug, body.code);
      return "error" in res ? NextResponse.json({ error: res.error }, { status: 400 }) : NextResponse.json(res);
    }
    case "decline": {
      if (p.status !== "pending") return NextResponse.json({ error: `Already ${p.status}` }, { status: 409 });
      await supabase.from("partners").update({ status: "declined" }).eq("id", p.id);
      return NextResponse.json({ ok: true });
    }
    case "pause": {
      if (p.status !== "active") return NextResponse.json({ error: `Can't pause a ${p.status} partner` }, { status: 409 });
      await supabase.from("partners").update({ status: "paused" }).eq("id", p.id);
      await setPromotionCodeActive(p.stripe_promotion_code_id, false);
      if (p.user_id) await revokeCompPremium(p.user_id);
      return NextResponse.json({ ok: true });
    }
    case "resume": {
      if (p.status !== "paused") return NextResponse.json({ error: `Can't resume a ${p.status} partner` }, { status: 409 });
      await supabase.from("partners").update({ status: "active" }).eq("id", p.id);
      await setPromotionCodeActive(p.stripe_promotion_code_id, true);
      if (p.user_id) await grantCompPremium(p.user_id);
      return NextResponse.json({ ok: true, message: welcomeMessage(p) });
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
