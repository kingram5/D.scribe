import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { canonicalizeEmail } from "@/lib/email";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";
import { deleteAudioForProjects } from "@/lib/storage-cleanup";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// POST /api/account/delete — full account deletion (GDPR Art. 17 / CCPA).
// IRREVERSIBLE: cancels billing, deletes all the user's data + storage, then the
// auth user itself. Everything is scoped to the authenticated user's id.
export async function POST() {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const supabase = createServerClient();
  const userId = user.id;

  // 1. Cancel any active Stripe subscription (best-effort — don't block deletion).
  try {
    const { data: balance } = await supabase
      .from("ink_balances")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .single();
    if (balance?.stripe_subscription_id) {
      await stripe.subscriptions.cancel(balance.stripe_subscription_id);
    }
  } catch (err) {
    logger.error("Account deletion: Stripe cancel failed", { route: "/api/account/delete", userId, error: err });
  }

  // 2. Delete R2 audio objects BEFORE the DB cascade orphans their keys.
  // NOT best-effort: these are the user's voice recordings under GDPR Art. 17.
  // If the objects can't be confirmed gone we must not drop the rows that
  // record which keys to clean, and we must not report { deleted: true }.
  // Failing the request leaves everything intact and retryable.
  try {
    const { data: projects, error: projErr } = await supabase
      .from("projects").select("id").eq("user_id", userId);
    if (projErr) throw new Error(`project lookup failed: ${projErr.message}`);
    const cleanup = await deleteAudioForProjects((projects ?? []).map((p) => p.id));
    if (cleanup.failed > 0) {
      logger.error("Account deletion: R2 cleanup incomplete — aborting before the key rows are dropped", {
        route: "/api/account/delete", userId,
        meta: { attempted: cleanup.attempted, failed: cleanup.failed },
      });
      return NextResponse.json({ error: "Could not remove voice recordings — try again shortly" }, { status: 502 });
    }
  } catch (err) {
    logger.error("Account deletion: R2 cleanup failed", { route: "/api/account/delete", userId, error: err });
    return NextResponse.json({ error: "Could not remove voice recordings — try again shortly" }, { status: 502 });
  }

  // 3. Delete the user's DB rows. Projects cascade their children (incl.
  // edit_events + style_deltas); drop the wallet and style memory too.
  // supabase-js does NOT throw on query errors — check each result, or a
  // failed delete falls through to removing the auth user and reporting
  // success while the manuscripts survive, orphaned.
  for (const table of ["projects", "ink_balances", "user_style_memory"] as const) {
    const { error: delDataErr } = await supabase.from(table).delete().eq("user_id", userId);
    if (delDataErr) {
      logger.error("Account deletion: DB delete failed", {
        route: "/api/account/delete", userId, meta: { table }, error: delDataErr,
      });
      return NextResponse.json({ error: "Failed to delete account data" }, { status: 500 });
    }
  }

  // 3.5 Record the email hash so a re-signup doesn't re-grant the free trial
  // (best-effort — the table ships in migration 015; skip quietly if absent).
  // Both the raw-lowercase and canonical forms: hashing only the raw form let
  // kyle+1@gmail.com re-sign as kyle@gmail.com with a fresh trial.
  try {
    if (user.email) {
      const forms = [...new Set([user.email.toLowerCase(), canonicalizeEmail(user.email)])];
      const rows = forms.map((f) => ({ email_hash: createHash("sha256").update(f).digest("hex") }));
      const { error: hashErr } = await supabase.from("deleted_account_emails").upsert(rows);
      if (hashErr) throw new Error(hashErr.message);
    }
  } catch (err) {
    logger.error("Account deletion: deleted-email record failed", { route: "/api/account/delete", userId, error: err });
  }

  // 4. Finally remove the auth user (irreversible) via the service-role admin API.
  const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
  if (delErr) {
    logger.error("Account deletion: auth user delete failed", { route: "/api/account/delete", userId, error: delErr });
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
