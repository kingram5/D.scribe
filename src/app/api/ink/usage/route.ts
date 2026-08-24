import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getTtsLimit } from "@/lib/tts";

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const supabase = createServerClient();

  const { data } = await supabase
    .from("ink_balances")
    .select("tts_chars_used, tts_period_start, tier, topup_tts_chars, topup_ink")
    .eq("user_id", user.id)
    .single();

  const tier = data?.tier ?? "free";
  const ttsCharsUsed = data?.tts_chars_used ?? 0;
  const ttsPeriodStart = data?.tts_period_start ?? new Date().toISOString();
  const ttsLimit = getTtsLimit(tier);

  return NextResponse.json({
    tts_chars_used: ttsCharsUsed,
    tts_limit: ttsLimit,
    tts_period_start: ttsPeriodStart,
    tier,
    topup_tts_chars: Number(data?.topup_tts_chars ?? 0),
    topup_ink: Number(data?.topup_ink ?? 0),
  });
}
