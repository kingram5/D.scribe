// HeyCatch identity + business events (2026-09-10). Client-side only: sign-in is
// a Supabase Auth Google-OAuth / magic-link flow that never passes through an
// app route the browser SDK could observe, so autocapture alone yields no
// funnel. `init` lives in instrumentation-client.ts (the client entry); every
// other SDK call the app makes goes through this file so the surface is in one
// place. Nothing here throws: analytics must never break sign-in or checkout.

import { analytics } from "@heycatch/sdk";
import type { User } from "@supabase/supabase-js";

export const SUBSCRIPTION_PLANS = ["starter", "pro", "premium"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

// localStorage key that records which user id already produced signup_completed
// on this browser, so the event fires once even though several components
// mount useAuth on the same page.
const SIGNUP_SENT_KEY = "dscribe_hc_signup_completed";
// A session whose last sign-in is this close to the account's creation is the
// account's first confirmed session (Supabase stamps both on the first OAuth /
// magic-link exchange; later sign-ins move last_sign_in_at away from created_at).
const FIRST_SESSION_WINDOW_MS = 5 * 60 * 1000;

let identifiedUserId: string | null = null;

function displayName(user: User): string | undefined {
  const meta = user.user_metadata ?? {};
  const name = meta.full_name ?? meta.name;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

/** Bind the HeyCatch identity to the app's stable internal user id (never the
 *  email or a token). Email and name ride along as properties. Repeat calls for
 *  the same user are skipped. */
export function identifyUser(user: User): void {
  if (identifiedUserId === user.id) return;
  identifiedUserId = user.id;
  try {
    analytics.setIdentity(user.id, { email: user.email, name: displayName(user) });
  } catch {
    identifiedUserId = null;
  }
}

/** Clear the identity on sign-out so the next visitor on this browser is not
 *  attributed to the previous account. */
export function resetIdentity(): void {
  identifiedUserId = null;
  try {
    analytics.resetIdentity();
  } catch {
    /* analytics must never block sign-out */
  }
}

export function isFirstConfirmedSession(user: User): boolean {
  const created = Date.parse(user.created_at);
  if (!Number.isFinite(created)) return false;
  if (!user.last_sign_in_at) return true;
  const last = Date.parse(user.last_sign_in_at);
  return !Number.isFinite(last) || Math.abs(last - created) <= FIRST_SESSION_WINDOW_MS;
}

/** Emit signup_completed once, at the first confirmed session of a new account.
 *  Callers only reach this behind the middleware gate, so the session is a
 *  confirmed-email one by construction. */
export function trackSignupCompletedOnce(user: User): void {
  if (typeof window === "undefined") return;
  if (!isFirstConfirmedSession(user)) return;
  try {
    if (window.localStorage.getItem(SIGNUP_SENT_KEY) === user.id) return;
    window.localStorage.setItem(SIGNUP_SENT_KEY, user.id);
  } catch {
    /* private mode / storage disabled: fall through and send once per load */
  }
  try {
    analytics.trackEvent("signup_completed");
  } catch {
    /* never block the app on analytics */
  }
}

export function isSubscriptionPlan(value: unknown): value is SubscriptionPlan {
  return typeof value === "string" && (SUBSCRIPTION_PLANS as readonly string[]).includes(value);
}

/** Emit subscription_started with the plan. The outcome is known client-side
 *  because Stripe Checkout only returns the browser to the success_url after
 *  the subscription is paid (see src/components/analytics/CheckoutOutcome.tsx). */
export function trackSubscriptionStarted(plan: SubscriptionPlan): void {
  try {
    analytics.trackEvent("subscription_started", { plan });
  } catch {
    /* never block the app on analytics */
  }
}
