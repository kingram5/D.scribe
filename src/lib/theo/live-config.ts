import { cohortAllows, openAIKey, ProviderUnavailable } from "@/lib/ai/config";
export function liveConfig(userId: string) {
  if (
    process.env.THEO_VOICE_PROVIDER !== "openai" ||
    process.env.THEO_LIVE_STAGING !== "true" ||
    process.env.VERCEL_ENV === "production" ||
    !cohortAllows(userId)
  )
    return null;
  openAIKey();
  const rate = Number(process.env.THEO_LIVE_USD_PER_MINUTE);
  if (!Number.isFinite(rate) || rate <= 0)
    throw new ProviderUnavailable("Verified Live rate is not configured.");
  const caps = {
    pro: Number(process.env.THEO_LIVE_PRO_SECONDS ?? 5200),
    premium: Number(process.env.THEO_LIVE_PREMIUM_SECONDS ?? 15600),
  };
  if (!Object.values(caps).every((n) => Number.isSafeInteger(n) && n > 0))
    throw new ProviderUnavailable("Invalid staging Live allowance.");
  return {
    model: process.env.OPENAI_THEO_LIVE_MODEL || "gpt-live-1",
    voice: "marin" as const,
    rate,
    caps,
  };
}
export const THEO_LIVE_PROMPT = `You are Theo, the Technical Human Expression Organizer, a calm, warm editorial guide interviewing a book's author. Listen patiently and allow natural interruptions. Ask the current editor question supplied by the backend. After the author answers, delegate before asking another editorial question; the backend owns question order and saves the answer. Do not invent facts, imply that you have changed the manuscript, or give tool instructions. If an answer is interrupted, listen for the author's continuation. Typed continuation is always available. Briefly acknowledge corrections and delegate them. Never perform unrelated tasks.`;
