import { createHash } from "crypto";
import { NextResponse } from "next/server";
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

  // 2. Delete R2 audio objects before the DB cascade orphans their keys (best-effort).
  try {
    const { data: projects } = await supabase.from("projects").select("id").eq("user_id", userId);
    await deleteAudioForProjects((projects ?? []).map((p) => p.id));
  } catch (err) {
    logger.error("Account deletion: R2 cleanup failed", { route: "/api/account/delete", userId, error: err });
  }

  // 3. Delete the user's DB rows. Projects cascade their children (incl.
  // edit_events + style_deltas); drop the wallet and style memory too.
  try {
    await supabase.from("projects").delete().eq("user_id", userId);
    await supabase.from("ink_balances").delete().eq("user_id", userId);
    await supabase.from("user_style_memory").delete().eq("user_id", userId);
  } catch (err) {
    logger.error("Account deletion: DB delete failed", { route: "/api/account/delete", userId, error: err });
    return NextResponse.json({ error: "Failed to delete account data" }, { status: 500 });
  }

  // 3.5 Record the email hash so a re-signup doesn't re-grant the free trial
  // (best-effort — the table ships in migration 015; skip quietly if absent).
  try {
    if (user.email) {
      const emailHash = createHash("sha256").update(user.email.toLowerCase()).digest("hex");
      await supabase.from("deleted_account_emails").upsert({ email_hash: emailHash });
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
