import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({
  createServerClient: vi.fn(() => ({ rpc })),
}));

import { checkRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit degraded mode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fails closed when the distributed limiter is unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });

    await expect(checkRateLimit("user", "paid-model", 10, 60_000)).resolves.toEqual({
      allowed: false,
      retryAfterMs: 60_000,
    });
  });

  it("only uses the process-local fallback when explicitly requested", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });

    await expect(checkRateLimit(`user-${Math.random()}`, "public-read", 1, 60_000, "local"))
      .resolves.toEqual({ allowed: true, retryAfterMs: 0 });
  });
});

describe("authenticated API coverage", () => {
  it("keeps the baseline limiter in the shared auth guard", () => {
    const auth = fs.readFileSync(path.resolve(__dirname, "..", "auth.ts"), "utf8");
    expect(auth).toMatch(/checkRateLimit\(user\.id,\s*"authenticated-api",\s*120\)/);
  });
});
