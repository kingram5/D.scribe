export const TTS_LIMITS: Record<string, number> = {
  free: 0,
  starter: 0, // gated — voice is a Pro/Premium feature
  pro: 20000,
  premium: 60000,
};

export function getTtsLimit(tier: string): number {
  return TTS_LIMITS[tier] ?? 0;
}

/**
 * T.H.E.O.'s spoken model. Server env THEO_TTS_MODEL picks it, limited to this
 * allowlist. Unset means Eleven v4 Turbo; any unknown value falls back to the
 * proven eleven_turbo_v2 so a typo in Vercel can never break the voice.
 * One-step way back: set THEO_TTS_MODEL=eleven_turbo_v2 and redeploy.
 */
export const THEO_TTS_MODELS = ["eleven_v4_turbo", "eleven_turbo_v2"] as const;
export type TheoTtsModel = (typeof THEO_TTS_MODELS)[number];
export const THEO_TTS_DEFAULT_MODEL: TheoTtsModel = "eleven_v4_turbo";
export const THEO_TTS_FALLBACK_MODEL: TheoTtsModel = "eleven_turbo_v2";

export function resolveTheoTtsModel(raw: string | undefined | null): TheoTtsModel {
  const value = (raw ?? "").trim();
  if (!value) return THEO_TTS_DEFAULT_MODEL;
  return (THEO_TTS_MODELS as readonly string[]).includes(value)
    ? (value as TheoTtsModel)
    : THEO_TTS_FALLBACK_MODEL;
}
