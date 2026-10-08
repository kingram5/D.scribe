import type { OpenAIRunConfig, PrStage } from "./config";
import { createServerClient } from "@/lib/supabase";
import {
  estimateRunInk,
  estimateChapterUsd,
  type EstimateOpts,
} from "@/lib/publisher-ready/estimate";
export async function configuredMultiplier(): Promise<number> {
  const { data, error } = await createServerClient()
    .from("ink_meter_settings")
    .select("value")
    .eq("key", "ink_per_vendor_dollar")
    .single();
  const n = Number(data?.value);
  if (error || !Number.isFinite(n) || n <= 0)
    throw new Error("Ink multiplier unavailable");
  return n;
}
export function estimateOpenAIUsd(
  words: number,
  config: OpenAIRunConfig,
  opts: EstimateOpts = {},
): number {
  // Conservative planning budgets, not promised spend. Reserve exact call bounds at execution.
  const tokens = Math.ceil(Math.max(500, words) * 2);
  const budgets: [PrStage, number, number][] = [
    ["beats", 10000, 8000],
    ["draft", 10000, tokens + 8000],
    ["edit", tokens + 12000, 16000],
    ["coverage", 12000, 4000],
    ["interview", 6000, 4000],
    ["revise", tokens + 18000, tokens + 16000],
    ["final", tokens + 2000, 8000],
  ];
  return (
    budgets
      .filter(([s]) =>
        opts.draftOnly
          ? ["beats", "draft"].includes(s)
          : !opts.skipDraft || !["beats", "draft"].includes(s),
      )
      .reduce((sum, [s, input, output]) => {
        const r = config.rates[config.stages[s].model];
        return sum + (input * r.input + output * r.output) / 1e6;
      }, 0) * 1.2
  );
}
export async function estimateConfiguredRun(
  chapters: { target_word_count: number | null }[],
  config: OpenAIRunConfig | null,
  opts: EstimateOpts = {},
): Promise<number> {
  if (!config) {
    if (process.env.INK_METER_V2 !== "true")
      return estimateRunInk(chapters, opts);
    const usd = chapters.reduce(
      (a, c) => a + estimateChapterUsd(c.target_word_count ?? 3000, opts),
      0,
    );
    return Math.ceil(usd * (await configuredMultiplier()));
  }
  const usd = chapters.reduce(
    (a, c) => a + estimateOpenAIUsd(c.target_word_count ?? 3000, config, opts),
    0,
  );
  return Math.ceil(usd * (await configuredMultiplier()));
}
