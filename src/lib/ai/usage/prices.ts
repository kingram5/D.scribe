import type { Price } from "../contracts";
/** Official public prices observed 2026-10-08; never activates a route or proves account access.
 * Copy only after rechecking region, tier, cache semantics and the smoke-call invoice.
 * Z.ai cache storage is advertised as limited-time free; reverify before each price version.
 */
export const OBSERVED_PRICES: Partial<Record<string, Price>> = {
  "openai/gpt-6-luna": {
    version: "public-2026-10-08",
    source: "https://developers.openai.com/api/docs/models/gpt-6-luna",
    verifiedAt: "2026-10-08",
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
    longContext: {
      threshold: 272000,
      inputMultiplier: 2,
      outputMultiplier: 1.5,
    },
    serviceTier: "default",
  },
  "anthropic/claude-sonnet-5-5": {
    version: "public-2026-10-08",
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
    verifiedAt: "2026-10-08",
    input: 2,
    output: 10,
    cacheRead: 0.1,
    cacheWrite: 2.5,
    cacheWrite1h: 4,
    serviceTier: "default",
  },
  "anthropic/claude-opus-5-5": {
    version: "public-2026-10-08",
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
    verifiedAt: "2026-10-08",
    input: 4,
    output: 20,
    cacheRead: 0.2,
    cacheWrite: 5,
    cacheWrite1h: 8,
    serviceTier: "default",
  },
  "zai/glm-5.3": {
    version: "public-2026-10-08",
    source: "https://docs.z.ai/guides/overview/pricing",
    verifiedAt: "2026-10-08",
    input: 1.4,
    output: 4.4,
    cacheRead: 0.26,
    cacheWrite: 0,
    serviceTier: "default",
  },
  "zai/glm-5.3-flash": {
    version: "public-2026-10-08",
    source: "https://docs.z.ai/guides/overview/pricing",
    verifiedAt: "2026-10-08",
    input: 0.15,
    output: 0.5,
    cacheRead: 0.03,
    cacheWrite: 0,
    serviceTier: "default",
  },
};
