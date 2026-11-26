"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { readConsent, CONSENT_EVENT } from "@/lib/consent";

// Vercel Web Analytics (raw traffic, referrers, top pages) for the growth
// dashboard's "see raw traffic" link, Kyle 2026-11-25. Cookieless page-view
// counts served from our own origin (/_vercel/insights/*).
//
// Same consent rule as FirstTouchCapture: on unless the visitor has declined
// analytics in the cookie banner, and it reacts to the banner live
// (CONSENT_EVENT) the way MarketingPixels does. A decline unmounts it, and
// beforeSend re-checks the cookie at send time so nothing is sent after one.
//
// Loaded as its own chunk after hydration (ssr: false), so it adds nothing to
// the shared first-load bundle or the server-rendered HTML.
const Analytics = dynamic(() => import("@vercel/analytics/next").then((m) => m.Analytics), { ssr: false });

const notDeclined = () => readConsent()?.analytics !== false;

export function VercelAnalytics() {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const sync = () => setOk(notDeclined());
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  // SSR and the first client render both produce null: no hydration mismatch.
  if (!ok) return null;
  return <Analytics beforeSend={(event) => (notDeclined() ? event : null)} />;
}
