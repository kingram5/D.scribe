export const TTS_LIMITS: Record<string, number> = {
  free: 0,
  starter: 0, // gated — voice is a Pro/Premium feature
  pro: 20000,
  premium: 60000,
};

export function getTtsLimit(tier: string): number {
  return TTS_LIMITS[tier] ?? 0;
}
