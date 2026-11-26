import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { classifyAiReferrer, parseFirstTouch, validateAnswer } from "@/lib/attribution";
import { logger } from "@/lib/logger";
import { isGrowthViewer } from "@/lib/growth-viewers";

export const dynamic = "force-dynamic";

// "How did you hear about us?" (SEO/GEO plan Phase 3b, Kyle 2026-11-14).
//
// FAIL SOFT, always: this must never stand between a new account and the app.
// If the user_attribution table is missing (migration 033 not run yet) or any
// query errors, GET says the question is not needed and POST answers 200 with
// { stored: false }, so a deploy before the migration cannot break signup.

/** GET: should this account see the first-run question? Yes only when it has no answer and no project yet. */
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  // Growth-dashboard viewers (GROWTH_VIEWER_EMAILS, e.g. Chiara) sign in to read
  // the numbers, not as customers: never block them with the question, and keep
  // their account out of the sign-up counts.
  if (isGrowthViewer(user.email)) return NextResponse.json({ needed: false });
  try {
    const supabase = createServerClient();
    const { data: row, error: aErr } = await supabase.from("user_attribution").select("user_id").eq("user_id", user.id).maybeSingle();
    if (aErr) return NextResponse.json({ needed: false });
    if (row) return NextResponse.json({ needed: false });
    const { count, error: pErr } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if (pErr) return NextResponse.json({ needed: false });
    return NextResponse.json({ needed: (count ?? 0) === 0 });
  } catch {
    return NextResponse.json({ needed: false });
  }
}

/** POST: save the answer plus the browser's first-visit record. First answer wins. */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { body = {}; }

  // Required: a missing or unknown source is a 400 (the client never lets it happen).
  const answer = validateAnswer(body.source, body.detail);
  if (!answer.ok) return NextResponse.json({ error: answer.error }, { status: 400 });

  // Passive data is client-supplied; parse defensively and keep only known fields.
  const touch = parseFirstTouch(body.passive);
  const ai = classifyAiReferrer(touch?.referrer, touch?.utm.utm_source);

  const row = {
    user_id: user.id,
    attribution_source: answer.source,
    attribution_detail: answer.detail,
    landing_url: touch?.landing_url ?? null,
    referrer: touch ? touch.referrer || null : null,
    // null = nothing was captured on this device; true/false = captured, with or without a referrer
    null_referrer: touch ? touch.null_referrer : null,
    utm_source: touch?.utm.utm_source ?? null,
    utm_medium: touch?.utm.utm_medium ?? null,
    utm_campaign: touch?.utm.utm_campaign ?? null,
    utm_term: touch?.utm.utm_term ?? null,
    utm_content: touch?.utm.utm_content ?? null,
    first_seen_at: touch?.captured_at || null,
    ai_referrer: ai,
  };

  try {
    const { error: wErr } = await createServerClient()
      .from("user_attribution")
      .upsert(row, { onConflict: "user_id", ignoreDuplicates: true });
    if (wErr) {
      logger.warn("attribution: not stored (table missing or write failed)", { route: "/api/attribution", userId: user.id, meta: { code: (wErr as { code?: string }).code } });
      return NextResponse.json({ stored: false });
    }
    return NextResponse.json({ stored: true, ai_referrer: ai });
  } catch (err) {
    logger.warn("attribution: not stored", { route: "/api/attribution", userId: user.id, error: err });
    return NextResponse.json({ stored: false });
  }
}
