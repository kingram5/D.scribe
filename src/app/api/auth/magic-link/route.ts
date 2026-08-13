import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { isDisposableEmail } from "@/lib/disposable-domains";
import { canonicalizeEmail } from "@/lib/email";
import { clientIp } from "@/lib/client-ip";
import { logger } from "@/lib/logger";
import {
  magicLinkRedirectUrl,
  safeNextPath,
  safeVercelShareToken,
} from "@/lib/auth-redirect";

// POST /api/auth/magic-link — gated server-side OTP sender.
// The login page used to call supabase.auth.signInWithOtp directly from the
// browser, which left signup wide open to trial-farming bots. Routing the send
// through here lets us rate-limit per IP + per email and block disposable
// domains before Supabase ever sends a mail. Response is intentionally generic
// (no user enumeration, no distinguishing block reasons).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  let email = "";
  let next = "/dashboard";
  let vercelShare: string | null = null;
  try {
    const body = await req.json();
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    next = safeNextPath(body.next);
    vercelShare = safeVercelShareToken(
      body._vercel_share ?? req.nextUrl.searchParams.get("_vercel_share")
    );
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const ip = clientIp(req);
  // IP gate first, sequentially — a blocked IP must not burn the per-email
  // counter, or three requests naming a victim's address lock them out of
  // email sign-in from anywhere.
  const ipLimit = await checkRateLimit(`ip:${ip}`, "magic-link", 6, 60 * 60_000); // 6/hour per IP
  if (!ipLimit.allowed) {
    logger.warn("magic-link rate limited", { route: "/api/auth/magic-link", meta: { ip } });
    return NextResponse.json({ error: "Too many requests — try again later" }, { status: 429 });
  }
  // Key on the canonical form (dots/+tags stripped) so aliasing can't mint
  // fresh keys — but keep sending to the address exactly as typed.
  const emailLimit = await checkRateLimit(`em:${canonicalizeEmail(email)}`, "magic-link", 3, 15 * 60_000); // 3/15min per email
  if (!emailLimit.allowed) {
    logger.warn("magic-link rate limited", { route: "/api/auth/magic-link", meta: { ip } });
    return NextResponse.json({ error: "Too many requests — try again later" }, { status: 429 });
  }

  if (isDisposableEmail(email)) {
    // Same generic success as the happy path: no mail arrives, no oracle exposed.
    logger.warn("magic-link disposable domain blocked", { route: "/api/auth/magic-link", meta: { ip } });
    return NextResponse.json({ ok: true });
  }

  // Anon-key client — same auth surface the browser used, minus the exposure.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const emailRedirectTo = magicLinkRedirectUrl(req, next, vercelShare);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });

  if (error) {
    logger.error("magic-link send failed", { route: "/api/auth/magic-link", error, meta: { ip } });
    if (/redirect|url.*(?:allow|reject)|not allowed/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            "This preview is not approved for sign-in yet. Ask the project owner to allow this preview URL in Supabase.",
        },
        { status: 400 }
      );
    }
    // Supabase's own email rate limit lands here too — keep other errors generic.
    return NextResponse.json({ error: "Could not send sign-in link — try again shortly" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
