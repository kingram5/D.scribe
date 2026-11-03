import type { ResponseUsage } from "openai/resources/responses/responses";
import type { ClaudeUsage } from "@/lib/claude-lite";
import type { ModelRate } from "./config";
export interface NormalizedUsage {
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
  reasoning: number;
}
export function normalizeUsage(u: ResponseUsage): NormalizedUsage {
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  const cacheWrite = u.input_tokens_details?.cache_write_tokens ?? 0;
  const reasoning = u.output_tokens_details?.reasoning_tokens ?? 0;
  const input = u.input_tokens - cached - cacheWrite;
  const values = [input, cached, cacheWrite, u.output_tokens, reasoning];
  if (
    !values.every((n) => Number.isSafeInteger(n) && n >= 0) ||
    reasoning > u.output_tokens ||
    u.total_tokens !== u.input_tokens + u.output_tokens
  )
    throw new Error("Unrecognized provider usage; reconciliation required.");
  // Details are subsets: reasoning is already in output; cache reads/writes in input.
  return { input, cached, cacheWrite, output: u.output_tokens, reasoning };
}
export function vendorDollars(u: NormalizedUsage, rate: ModelRate): number {
  const longContext = u.input + u.cached + u.cacheWrite > 272000;
  const inputFactor = longContext ? 2 : 1;
  const outputFactor = longContext ? 1.5 : 1;
  return (
    ((u.input * rate.input +
      u.cached * rate.cached +
      u.cacheWrite * rate.cacheWrite) *
      inputFactor +
      u.output * rate.output * outputFactor) /
    1e6
  );
}
export function compatibleUsage(u: NormalizedUsage): ClaudeUsage {
  return {
    input_tokens: u.input,
    output_tokens: u.output,
    cache_read_input_tokens: u.cached,
    cache_creation_input_tokens: u.cacheWrite,
  };
}
