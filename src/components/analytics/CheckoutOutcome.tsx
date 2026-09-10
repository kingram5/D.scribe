"use client";

import { useEffect } from "react";
import { isSubscriptionPlan, trackSubscriptionStarted } from "@/lib/heycatch";

/**
 * HeyCatch subscription_started (2026-09-10).
 *
 * Stripe Checkout sends the browser back to
 * `/dashboard?upgraded=true&plan=<tier>` only after the subscription is paid
 * (src/app/api/stripe/checkout/route.ts), so the outcome and the plan are known
 * client-side without touching the webhook or the Ink ledger. Fires once per
 * landing, then strips the two params from the URL so a reload or a bookmark
 * does not replay it. Reads window.location directly (no useSearchParams, so
 * no Suspense boundary is needed in the layout). Mounted in src/app/(main)/layout.tsx.
 */
export function CheckoutOutcome() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("upgraded") !== "true") return;
    const plan = url.searchParams.get("plan");
    if (isSubscriptionPlan(plan)) trackSubscriptionStarted(plan);
    url.searchParams.delete("upgraded");
    url.searchParams.delete("plan");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  return null;
}
