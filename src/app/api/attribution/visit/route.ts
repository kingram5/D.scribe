import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { CONSENT_COOKIE, parseConsentValue } from "@/lib/consent";
import { logger } from "@/lib/logger";
import {
  VISIT_MAX_BODY_BYTES, VISIT_RATE_LIMIT_PER_HOUR,
  channelFromPingBody, hashedIpKey, isForeignOrigin, isLikelyBot,
} from "@/lib/visit-ping";

export const dynamic = "force-dynamic";

// POST /api/attribution/visit: one anonymous visit, counted under a marketing
// channel, for the growth dashboard (Kyle 2026-11-25). The browser sends this
// once, the first time it ever visits, and only when analytics is not
// declined (FirstTouchCapture).
//
// Stores NOTHING about the person: no user id, no IP, no URL. The server
// works out the channel itself from the referrer / utm_* the browser recorded
// (never from a channel name in the body) and adds one to today's count via
// bump_visit_channel() (service role only, migration 033).
//
// FAIL SOFT: a missing table/function or any database error answers 200
// { counted: false }; nothing on the page waits on this call.

const notCounted = () => NextResponse.json({ counted: false });

export async function POST(req: NextRequest) {
  try {
    // Preview deployments can point at the production database: browsing a
    // preview must never add to the real counts.
    if (process.env.VERCEL_ENV === "preview") return notCounted();
    // Cheap filters first, before any database call.
    if (isLikelyBot(req.headers.get("user-agent"))) return notCounted();
    if (isForeignOrigin(req.headers.get("origin"), [req.nextUrl.host, req.headers.get("host"), req.headers.get("x-forwarded-host")])) return notCounted();
    // Honour a decline even from a client that ignores it.
    if (parseConsentValue(req.cookies.get(CONSENT_COOKIE)?.value)?.analytics === false) return notCounted();

    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > VISIT_MAX_BODY_BYTES) return NextResponse.json({ counted: false }, { status: 413 });

    // Per-IP limit like the other anonymous routes, keyed on a hash of the IP.
    // Counting cannot cause vendor spend, so a limiter outage falls back to the
    // per-instance limiter instead of refusing.
    const { allowed } = await checkRateLimit(hashedIpKey(clientIp(req)), "attribution-visit", VISIT_RATE_LIMIT_PER_HOUR, 60 * 60_000, "local");
    if (!allowed) return NextResponse.json({ counted: false }, { status: 429 });

    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > VISIT_MAX_BODY_BYTES) return NextResponse.json({ counted: false }, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ counted: false }, { status: 400 }); }
    const channel = channelFromPingBody(body);
    if (!channel) return NextResponse.json({ counted: false }, { status: 400 });

    const { error } = await createServerClient().rpc("bump_visit_channel", { p_channel: channel });
    if (error) {
      logger.warn("visit: not counted (migration 033 missing or write failed)", { route: "/api/attribution/visit", meta: { code: (error as { code?: string }).code } });
      return notCounted();
    }
    return NextResponse.json({ counted: true, channel });
  } catch (err) {
    logger.warn("visit: not counted", { route: "/api/attribution/visit", error: err });
    return notCounted();
  }
}
