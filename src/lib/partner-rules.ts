// Creator partner program: the numbers and pure rules (client-safe, no imports).
// Kyle 2026-09-25: a creator link or code gives a NEW account 50 free Ink, once
// per person, plus 50% off the first month of any plan (refills pay full price).
// The creator earns 30% of what their referrals pay for 12 months, counted after
// the 30-day refund window, and Kyle releases payouts by hand.

export const PARTNER_BONUS_INK = 50;
export const PARTNER_DISCOUNT_PERCENT = 50;
export const PARTNER_COMMISSION_RATE = 0.3;
export const PARTNER_COMMISSION_MONTHS = 12;
export const COMMISSION_HOLD_DAYS = 30;
export const PAYOUT_MINIMUM_CENTS = 2500;
/** "New account" for the free Ink: signed up within this many days of claiming. */
export const NEW_ACCOUNT_DAYS = 7;
/** Promotion code defaults: capped uses and an expiry, so a leaked code is bounded. */
export const PROMO_MAX_REDEMPTIONS = 500;
export const PROMO_VALID_DAYS = 365;

/** Cookies set by /r/<slug>: the slug (for the claim) and the display name (for the banner). */
export const REF_COOKIE = "ds_ref";
export const REF_NAME_COOKIE = "ds_ref_name";
export const REF_COOKIE_DAYS = 60;

const DAY_MS = 86_400_000;

/** Lowercase letters, digits and dashes, 2-32 long. Returns null when it can't be made valid. */
export function normalizeSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return /^[a-z0-9-]{2,32}$/.test(s) ? s : null;
}

/** Uppercase letters, digits and dashes, 3-24 long (Stripe promotion code characters). */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase().replace(/[^A-Z0-9-]+/g, "");
  return /^[A-Z0-9-]{3,24}$/.test(s) ? s : null;
}

/** Suggested slug + code from a creator's name: "Pastor Jane Doe" -> pastor-jane-doe / PASTORJANEDOE50. */
export function suggestSlugAndCode(name: string): { slug: string | null; code: string | null } {
  const slug = normalizeSlug(name.slice(0, 32));
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 20);
  return { slug, code: normalizeCode(`${base}${PARTNER_DISCOUNT_PERCENT}`) };
}

/** 30% of what was paid, rounded down to the cent. */
export function commissionCents(amountPaidCents: number, rate = PARTNER_COMMISSION_RATE): number {
  if (!Number.isFinite(amountPaidCents) || amountPaidCents <= 0) return 0;
  const r = Math.min(Math.max(rate, 0), 0.9);
  return Math.floor(amountPaidCents * r);
}

/** Is a payment at `paidAt` inside the commission window that opened at `firstPaidAt`? */
export function inCommissionWindow(firstPaidAt: Date, paidAt: Date, months = PARTNER_COMMISSION_MONTHS): boolean {
  const end = new Date(firstPaidAt.getTime());
  end.setUTCMonth(end.getUTCMonth() + months);
  return paidAt.getTime() >= firstPaidAt.getTime() - DAY_MS && paidAt.getTime() < end.getTime();
}

/** When a commission clears the refund window and can be paid. */
export function commissionAvailableAt(paidAt: Date, holdDays = COMMISSION_HOLD_DAYS): Date {
  return new Date(paidAt.getTime() + holdDays * DAY_MS);
}

/** New enough for the free Ink? */
export function isNewAccount(createdAt: string | Date | null | undefined, now = new Date(), days = NEW_ACCOUNT_DAYS): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t <= days * DAY_MS;
}

export type PayableCommission = { commission_cents: number; status: string; available_at: string; payout_id: string | null };

/** Cents that have cleared the hold and haven't been paid or voided. */
export function payableCents(rows: PayableCommission[], now = new Date()): number {
  return rows
    .filter((r) => r.status === "held" && !r.payout_id && new Date(r.available_at).getTime() <= now.getTime())
    .reduce((sum, r) => sum + r.commission_cents, 0);
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
