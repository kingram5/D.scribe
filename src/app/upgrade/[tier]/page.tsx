"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

// Checkout hand-off for the pricing page.
//
// The pricing cards used to link straight to /login, which dropped the chosen
// plan on the floor: a signed-in visitor landed on the login page and bounced
// to the dashboard, and a new visitor signed up and never reached checkout.
// This route is NOT in the middleware's public list, so an anonymous visitor is
// sent to /login?next=/upgrade/<tier> and returns here signed in. The tier
// rides in the path because the middleware only preserves the pathname.
const TIERS = ["starter", "pro", "premium"] as const;
type Tier = (typeof TIERS)[number];

function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

export default function UpgradePage() {
  const params = useParams<{ tier: string }>();
  const tier = String(params?.tier ?? "").toLowerCase();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!isTier(tier)) {
      window.location.assign("/pricing");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier }),
        });
        if (res.status === 401) {
          window.location.assign(`/login?next=${encodeURIComponent(`/upgrade/${tier}`)}`);
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (data?.url) {
          window.location.assign(data.url);
          return;
        }
        setError(typeof data?.error === "string" ? data.error : "Could not start checkout.");
      } catch {
        setError("Could not start checkout.");
      }
    })();
  }, [tier]);

  const label = isTier(tier) ? tier.charAt(0).toUpperCase() + tier.slice(1) : "";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#2C2419",
        color: "#F9F7F2",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
        fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
      }}
    >
      {error ? (
        <>
          <h1 style={{ fontFamily: "var(--font-playfair), serif", fontSize: 28, margin: 0 }}>
            Checkout didn&apos;t open
          </h1>
          <p style={{ color: "#A89F94", fontSize: 14, margin: 0, maxWidth: 420 }}>{error}</p>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <Link
              href={`/upgrade/${tier}`}
              style={{ background: "#C17A47", color: "#fff", padding: "11px 22px", borderRadius: 12, textDecoration: "none", fontWeight: 600, fontSize: 14 }}
            >
              Try again
            </Link>
            <Link
              href="/pricing"
              style={{ color: "#F9F7F2", padding: "11px 22px", borderRadius: 12, textDecoration: "none", fontWeight: 600, fontSize: 14, border: "1px solid rgba(249,247,242,0.15)" }}
            >
              Back to pricing
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 style={{ fontFamily: "var(--font-playfair), serif", fontSize: 28, margin: 0 }}>
            Taking you to checkout{label ? ` for ${label}` : ""}…
          </h1>
          <p style={{ color: "#A89F94", fontSize: 14, margin: 0 }}>Payment is handled by Stripe.</p>
        </>
      )}
    </main>
  );
}
