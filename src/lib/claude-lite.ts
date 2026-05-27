/**
 * Lightweight Claude API client using raw fetch.
 * Replaces the Anthropic SDK to avoid its ~1.8 GB memory footprint on Vercel.
 */

import { logger } from "@/lib/logger";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export type ModelTier = "fast" | "quality";

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
}

const MODELS: Record<ModelTier, string> = {
  fast: "claude-haiku-4-5-20251001",
  quality: "claude-sonnet-4-6",
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
    const message = `Claude API ${res.status}: ${err.slice(0, 200)}`;
    logger.error(message, {
      meta: {
        status: res.status,
        model: MODELS[options?.model ?? "quality"],
        body: err.slice(0, 500),
      },
    });
    throw new Error(message);
  }

  const data = await res.json();
  const block = data.content?.[0];
  return block?.type === "text" ? block.text : "";
}

/** Strip markdown fences from JSON responses and extract only the JSON portion */
export function cleanJsonLite(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```[\s\S]*$/, "");
  }
  s = s.trim();
  // Extract just the JSON object/array, ignoring trailing commentary
  const start = s[0];
  if (start === "[" || start === "{") {
    const close = start === "[" ? "]" : "}";
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "[" || c === "{") depth++;
      else if (c === "]" || c === "}") depth--;
      if (depth === 0) return s.slice(0, i + 1);
    }
  }
  return s;
}

export async function askClaudeWithUsage(
  system: string,
  userMessage: string,
  options?: { model?: ModelTier; maxTokens?: number; temperature?: number }
): Promise<{ text: string; usage: ClaudeUsage }> {
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
    const message = `Claude API ${res.status}: ${err.slice(0, 200)}`;
    logger.error(message, { meta: { status: res.status, body: err.slice(0, 500) } });
    throw new Error(message);
  }

  const data = await res.json();
  const block = data.content?.[0];
  return {
    text: block?.type === "text" ? block.text : "",
    usage: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 },
  };
}

// Aliases for drop-in compatibility with claude.ts imports
export { askClaudeLite as askClaude };
export { cleanJsonLite as cleanJson };

// Map creative freedom slider (0-100) to temperature.
// Ratio 1:0.75 — temp rises 0.0075 per 1% (0% -> 0.0, 50% -> 0.375, 100% -> 0.75).
export function creativeFreedomToTemp(freedom: number): number {
  return Math.round(freedom * 0.0075 * 1000) / 1000;
}

// Map creative freedom to a prompt instruction. Granular across the 5 UI tiers
// so moving the slider actually changes behavior — temperature alone is a weak lever.
export function creativeFreedomToInstruction(freedom: number): string {
  if (freedom <= 20) {
    return "Stay extremely close to the transcript. Preserve the original wording and order; only clean up false starts, filler, and grammar. Add almost nothing of your own.";
  } else if (freedom <= 40) {
    return "Follow the transcript closely with light editorial polish. Smooth transitions and tighten phrasing, but keep the original ideas, order, and wording largely intact.";
  } else if (freedom <= 60) {
    return "Balance fidelity with readability. Restructure for flow, develop ideas a little further, and add connective tissue, while keeping every core point and the author's voice.";
  } else if (freedom <= 80) {
    return "Take real editorial liberties. Reorganize freely, expand thin points, add illustrations and transitions, and sharpen the argument, while preserving the author's message and voice.";
  } else {
    return "Treat the transcript as raw source, not a script. Freely reinterpret, expand, restructure, and develop fresh analogies and examples to make it book-quality, staying true only to the core message and the author's voice.";
  }
}
