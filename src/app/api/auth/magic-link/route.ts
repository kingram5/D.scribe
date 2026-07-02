import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { isDisposableEmail } from "@/lib/disposable-domains";
import { logger } from "@/lib/logger";

// POST /api/auth/magic-link — gated server-side OTP sender.
// The login page used to call supabase.auth.signInWithOtp directly from the
// browser, which left signup wide open to trial-farming bots. Routing the send
// through here lets us rate-limit per IP + per email and block disposable
// domains before Supabase ever sends a mail. Response is intentionally generic
// (no user enumeration, no distinguishing block reasons).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : "").trim() || "unknown";
}

export async function POST(req: NextRequest) {
  let email = "";
  let next = "/dashboard";
  try {
    const body = await req.json();
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//")) {
      next = body.next;
    }
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const ip = clientIp(req);
  const [ipLimit, emailLimit] = await Promise.all([
    checkRateLimit(`ip:${ip}`, "magic-link", 6, 60 * 60_000),   // 6/hour per IP
    checkRateLimit(`em:${email}`, "magic-link", 3, 15 * 60_000), // 3/15min per email
  ]);
  if (!ipLimit.allowed || !emailLimit.allowed) {
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
  const origin = req.nextUrl.origin;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}` },
  });

  if (error) {
    logger.error("magic-link send failed", { route: "/api/auth/magic-link", error, meta: { ip } });
    // Supabase's own email rate limit lands here too — keep the message generic.
    return NextResponse.json({ error: "Could not send sign-in link — try again shortly" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
