// Creator partner program, server side: referral claims, the creator discount,
// commissions and admin checks. Every table behind this is service-role only.
// Rules and numbers live in partner-rules.ts.
import { createHash } from "crypto";
import type Stripe from "stripe";
import { createServerClient } from "@/lib/supabase";
import { stripe, STRIPE_PRICES } from "@/lib/stripe";
import { ensureBalance } from "@/lib/ink";
import { canonicalizeEmail } from "@/lib/email";
import { isDisposableEmail } from "@/lib/disposable-domains";
import { logger } from "@/lib/logger";
import {
  PARTNER_BONUS_INK,
  PARTNER_DISCOUNT_PERCENT,
  PROMO_MAX_REDEMPTIONS,
  PROMO_VALID_DAYS,
  commissionAvailableAt,
  commissionCents,
  inCommissionWindow,
  isNewAccount,
} from "@/lib/partner-rules";

export type Partner = {
  id: string;
  slug: string | null;
  code: string | null;
  name: string;
  email: string;
  user_id: string | null;
  status: "pending" | "active" | "paused" | "declined";
  source: "application" | "invite";
  links: string | null;
  audience: string | null;
  pitch: string | null;
  commission_rate: number;
  commission_months: number;
  stripe_promotion_code_id: string | null;
  stripe_connect_account_id: string | null;
  approved_at: string | null;
  created_at: string;
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const emailHash = (email: string) => sha(canonicalizeEmail(email));

// ── lookups ──────────────────────────────────────────────────────────────────

export async function findActivePartnerBySlug(slug: string): Promise<Partner | null> {
  const { data } = await createServerClient().from("partners").select("*").eq("slug", slug).eq("status", "active").maybeSingle();
  return (data as Partner | null) ?? null;
}

export async function findActivePartnerByCode(code: string): Promise<Partner | null> {
  const { data } = await createServerClient().from("partners").select("*").eq("code", code).eq("status", "active").maybeSingle();
  return (data as Partner | null) ?? null;
}

export async function findPartnerForUser(userId: string, email?: string | null): Promise<Partner | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from("partners").select("*").eq("user_id", userId).maybeSingle();
  if (data) return data as Partner;
  if (!email) return null;
  // An approved creator who signs in for the first time: link the account by email.
  // exact match only: ilike treats _ and % as wildcards, and this link decides who gets paid
  const { data: byEmail } = await supabase
    .from("partners").select("*").eq("email", email.trim().toLowerCase()).is("user_id", null).in("status", ["active", "paused"]).limit(1).maybeSingle();
  if (!byEmail) return null;
  const { data: linked } = await supabase
    .from("partners").update({ user_id: userId }).eq("id", (byEmail as Partner).id).is("user_id", null).select("*").maybeSingle();
  if (linked && (linked as Partner).status === "active") await grantCompPremium(userId);
  return (linked as Partner | null) ?? null;
}

// ── referral claim (link, code, or a code typed at checkout) ─────────────────

export type ClaimResult = { claimed: boolean; bonus: number; partnerName?: string };

/**
 * Attach a new account to a creator and, if the account qualifies, add the free
 * Ink to its non-expiring top-up bucket. First touch wins; never throws.
 */
export async function claimReferral(args: {
  userId: string;
  email: string | null | undefined;
  userCreatedAt: string | null | undefined;
  partner: Partner;
  source: "link" | "code" | "checkout";
}): Promise<ClaimResult> {
  const { userId, email, userCreatedAt, partner, source } = args;
  try {
    const supabase = createServerClient();
    const { data: existing } = await supabase.from("referrals").select("user_id").eq("user_id", userId).maybeSingle();
    if (existing) return { claimed: false, bonus: 0 };
    // a creator can't refer themselves
    if (partner.user_id === userId || (email && canonicalizeEmail(partner.email) === canonicalizeEmail(email))) {
      return { claimed: false, bonus: 0 };
    }

    const balance = await ensureBalance(userId); // creates the wallet behind the usual anti-farming checks
    // An account already on a paid plan isn't a creator's customer: clicking a link
    // must not start a commission on someone who already pays. Checkout is the
    // exception, because the webhook activates the plan before attribution runs.
    if (source !== "checkout" && balance.tier !== "free") return { claimed: false, bonus: 0 };
    let eligible = source !== "checkout" && isNewAccount(userCreatedAt);
    let hash: string | null = null;
    if (email) {
      hash = emailHash(email);
      if (isDisposableEmail(email)) eligible = false;
      if (eligible) {
        const hashes = [...new Set([sha(email.trim().toLowerCase()), hash])];
        const { data: deleted } = await supabase.from("deleted_account_emails").select("email_hash").in("email_hash", hashes).limit(1);
        if (deleted && deleted.length > 0) eligible = false; // re-signup after deleting an account
      }
    } else {
      eligible = false;
    }

    const { data, error } = await supabase.rpc("claim_partner_referral", {
      p_user_id: userId,
      p_partner_id: partner.id,
      p_source: source,
      p_email_hash: hash,
      p_bonus: eligible ? PARTNER_BONUS_INK : 0,
    });
    if (error) throw new Error(error.message);
    if (data === null) return { claimed: false, bonus: 0 };
    return { claimed: true, bonus: Number(data ?? 0), partnerName: partner.name };
  } catch (err) {
    logger.error("Partner referral claim failed", { route: "partners/claim", meta: { user_id: userId, partner: partner.id }, error: err });
    return { claimed: false, bonus: 0 };
  }
}

export async function referralFor(userId: string): Promise<{ partner: Partner; first_paid_at: string | null } | null> {
  const supabase = createServerClient();
  const { data: ref } = await supabase.from("referrals").select("partner_id, first_paid_at").eq("user_id", userId).maybeSingle();
  if (!ref) return null;
  const { data: partner } = await supabase.from("partners").select("*").eq("id", ref.partner_id).maybeSingle();
  if (!partner) return null;
  return { partner: partner as Partner, first_paid_at: (ref.first_paid_at as string | null) ?? null };
}

// ── the creator discount in Stripe ───────────────────────────────────────────

const PARTNER_COUPON_ID = "dscribe-creator-50-first-month";

/** One shared coupon: 50% off, first invoice only, the three plans only. Created on first use. */
export async function ensurePartnerCoupon(): Promise<string> {
  try {
    const c = await stripe.coupons.retrieve(PARTNER_COUPON_ID);
    if (c && !c.deleted) return c.id;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "resource_missing") throw err;
  }
  const priceIds = Object.values(STRIPE_PRICES).filter(Boolean);
  const products = await Promise.all(priceIds.map(async (p) => {
    const price = await stripe.prices.retrieve(p);
    return typeof price.product === "string" ? price.product : price.product.id;
  }));
  const coupon = await stripe.coupons.create({
    id: PARTNER_COUPON_ID,
    name: `Creator ${PARTNER_DISCOUNT_PERCENT}% off first month`,
    percent_off: PARTNER_DISCOUNT_PERCENT,
    duration: "once",
    applies_to: { products: [...new Set(products)] },
  });
  return coupon.id;
}

/** The creator's own promotion code (their code string), capped and expiring. */
export async function createPartnerPromotionCode(partner: Pick<Partner, "id" | "code" | "slug">): Promise<string> {
  if (!partner.code) throw new Error("Partner has no code");
  const coupon = await ensurePartnerCoupon();
  const promo = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon },
    code: partner.code,
    max_redemptions: PROMO_MAX_REDEMPTIONS,
    expires_at: Math.floor(Date.now() / 1000) + PROMO_VALID_DAYS * 86_400,
    restrictions: { first_time_transaction: true },
    metadata: { partner_id: partner.id, slug: partner.slug ?? "" },
  });
  return promo.id;
}

export async function setPromotionCodeActive(promotionCodeId: string | null, active: boolean) {
  if (!promotionCodeId) return;
  try {
    await stripe.promotionCodes.update(promotionCodeId, { active });
  } catch (err) {
    logger.error("Could not toggle partner promotion code", { route: "partners", meta: { promotionCodeId, active }, error: err });
  }
}

/** Has this Stripe customer ever had a subscription? The 50% is for first-time subscribers. */
export async function hadSubscriptionBefore(customerId: string): Promise<boolean> {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
  return subs.data.length > 0;
}

// ── comp Premium for active partners ─────────────────────────────────────────

export async function grantCompPremium(userId: string) {
  const supabase = createServerClient();
  await ensureBalance(userId);
  // never touch a paying subscriber's plan
  const { error } = await supabase
    .from("ink_balances")
    .update({ tier: "premium", comp_partner: true, ink_balance: 1500, ink_period_start: new Date().toISOString() })
    .eq("user_id", userId)
    .is("stripe_subscription_id", null);
  if (error) logger.error("grantCompPremium failed", { route: "partners", meta: { user_id: userId }, error });
  await supabase.from("ink_balances").update({ comp_partner: true }).eq("user_id", userId);
}

export async function revokeCompPremium(userId: string) {
  const supabase = createServerClient();
  await supabase
    .from("ink_balances")
    .update({ tier: "free", ink_balance: 0, comp_partner: false })
    .eq("user_id", userId)
    .eq("comp_partner", true)
    .is("stripe_subscription_id", null);
  await supabase.from("ink_balances").update({ comp_partner: false }).eq("user_id", userId);
}

// ── commissions (called from the Stripe webhook, after entitlement is settled) ─

async function userForCustomer(customerId: string): Promise<string | null> {
  const { data } = await createServerClient().from("ink_balances").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

/** A completed checkout that used a creator's code: attach the buyer if nobody referred them yet. */
export async function attributeCheckout(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  if (!userId) return;
  const promo = session.discounts?.find((d) => d.promotion_code)?.promotion_code;
  const promoId = typeof promo === "string" ? promo : promo?.id;
  const supabase = createServerClient();
  if (promoId) {
    const { data: partner } = await supabase.from("partners").select("*").eq("stripe_promotion_code_id", promoId).maybeSingle();
    if (partner) {
      await claimReferral({ userId, email: session.customer_details?.email ?? null, userCreatedAt: null, partner: partner as Partner, source: "checkout" });
    }
  }
  if (session.mode === "subscription") {
    await supabase.from("referrals").update({ first_paid_at: new Date().toISOString() }).eq("user_id", userId).is("first_paid_at", null);
  }
}

async function recordCommission(args: {
  userId: string;
  sourceId: string;
  paymentIntent: string | null;
  kind: "subscription" | "topup";
  amountCents: number;
  paidAt: Date;
}) {
  const ref = await referralFor(args.userId);
  if (!ref || (ref.partner.status !== "active" && ref.partner.status !== "paused")) return;
  const supabase = createServerClient();
  let firstPaid = ref.first_paid_at ? new Date(ref.first_paid_at) : null;
  if (!firstPaid) {
    firstPaid = args.paidAt;
    await supabase.from("referrals").update({ first_paid_at: firstPaid.toISOString() }).eq("user_id", args.userId).is("first_paid_at", null);
  }
  if (!inCommissionWindow(firstPaid, args.paidAt, ref.partner.commission_months)) return;
  const cents = commissionCents(args.amountCents, Number(ref.partner.commission_rate));
  if (cents <= 0) return;
  const { error } = await supabase.from("partner_commissions").upsert(
    {
      partner_id: ref.partner.id,
      user_id: args.userId,
      source_id: args.sourceId,
      payment_intent: args.paymentIntent,
      kind: args.kind,
      amount_cents: args.amountCents,
      commission_cents: cents,
      available_at: commissionAvailableAt(args.paidAt).toISOString(),
    },
    { onConflict: "source_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`recordCommission failed: ${error.message}`);
}

export async function recordInvoiceCommission(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string | null;
  if (!customerId || !invoice.id || (invoice.amount_paid ?? 0) <= 0) return;
  const userId = await userForCustomer(customerId);
  if (!userId) return;
  let paymentIntent: string | null = null;
  try {
    const payments = await stripe.invoicePayments.list({ invoice: invoice.id, limit: 1 });
    const pi = payments.data[0]?.payment?.payment_intent;
    paymentIntent = typeof pi === "string" ? pi : pi?.id ?? null;
  } catch { /* refund matching falls back to the invoice total; the row still records */ }
  const paidAt = invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : new Date();
  await recordCommission({ userId, sourceId: invoice.id, paymentIntent, kind: "subscription", amountCents: invoice.amount_paid, paidAt });
}

/** Full refund or dispute: the commission on that payment never gets paid. */
export async function voidCommissionsForPayment(paymentIntent: string) {
  const { error } = await createServerClient()
    .from("partner_commissions").update({ status: "void" }).eq("payment_intent", paymentIntent).eq("status", "held");
  if (error) throw new Error(`voidCommissions failed: ${error.message}`);
}

// ── admin ────────────────────────────────────────────────────────────────────

export function isPartnerAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.PARTNER_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean).map(canonicalizeEmail);
  return admins.includes(canonicalizeEmail(email));
}
