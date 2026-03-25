/**
 * Lightweight Claude API client using raw fetch.
 * Replaces the Anthropic SDK to avoid its ~1.8 GB memory footprint on Vercel.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export type ModelTier = "fast" | "quality";

const MODELS: Record<ModelTier, string> = {
  fast: "claude-haiku-4-5-20251001",
  quality: "claude-sonnet-4-20250514",
};

export async function askClaudeLite(
  system: string,
  userMessage: string,
  options?: { model?: ModelTier; maxTokens?: number; temperature?: number }
): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: MODELS[options?.model ?? "quality"],
      max_tokens: options?.maxTokens ?? 8192,
      temperature: options?.temperature ?? 0.6,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const block = data.content?.[0];
  return block?.type === "text" ? block.text : "";
}

/** Strip markdown fences from JSON responses */
export function cleanJsonLite(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return s.trim();
}
