export const TTS_LIMITS: Record<string, number> = {
  free: 0,
  starter: 8000,
  pro: 20000,
  premium: 60000,
};

export function getTtsLimit(tier: string): number {
  return TTS_LIMITS[tier] ?? 0;
}
