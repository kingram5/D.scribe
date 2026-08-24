import { TOPUP_GRANTS } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase";
import { applyTopupGrant, clawbackTopup, type TopupSku } from "@/lib/topups";

export async function grantTopupPurchase(input: {
  userId: string;
  sku: TopupSku;
  stripeSessionId: string;
  paymentIntent: string | null;
  amountCents: number;
}): Promise<{ granted: boolean; replayed: boolean }> {
  const supabase = createServerClient();
  const granted = TOPUP_GRANTS[input.sku];
  const { error: insertError } = await supabase.from("topup_purchases").insert({
    user_id: input.userId,
    sku: input.sku,
    stripe_session_id: input.stripeSessionId,
    stripe_payment_intent: input.paymentIntent,
    amount_cents: input.amountCents,
    granted,
    status: "granted",
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { granted: false, replayed: true };
    }
    throw new Error(`topup insert failed: ${insertError.message}`);
  }

  const { data: balance } = await supabase
    .from("ink_balances")
    .select("topup_ink, topup_tts_chars")
    .eq("user_id", input.userId)
    .single();

  const next = applyTopupGrant({
    topup_ink: Number(balance?.topup_ink ?? 0),
    topup_tts_chars: Number(balance?.topup_tts_chars ?? 0),
  }, input.sku);

  const { error } = await supabase
    .from("ink_balances")
    .update(next)
    .eq("user_id", input.userId);
  if (error) throw new Error(`topup grant failed: ${error.message}`);
  return { granted: true, replayed: false };
}

export async function clawbackTopupPurchase(paymentIntent: string): Promise<boolean> {
  const supabase = createServerClient();
  const { data: purchase } = await supabase
    .from("topup_purchases")
    .select("id, user_id, sku, granted, status")
    .eq("stripe_payment_intent", paymentIntent)
    .maybeSingle();

  if (!purchase || purchase.status !== "granted") return false;

  const { error: markError } = await supabase
    .from("topup_purchases")
    .update({ status: "clawed_back" })
    .eq("id", purchase.id)
    .eq("status", "granted");
  if (markError) throw new Error(`topup clawback mark failed: ${markError.message}`);

  const { data: balance } = await supabase
    .from("ink_balances")
    .select("topup_ink, topup_tts_chars")
    .eq("user_id", purchase.user_id)
    .single();

  const granted = (purchase.granted ?? {}) as { ink?: number; tts_chars?: number };
  const next = clawbackTopup({
    topup_ink: Number(balance?.topup_ink ?? 0),
    topup_tts_chars: Number(balance?.topup_tts_chars ?? 0),
  }, granted);

  const { error } = await supabase
    .from("ink_balances")
    .update(next)
    .eq("user_id", purchase.user_id);
  if (error) throw new Error(`topup clawback failed: ${error.message}`);
  return true;
}
