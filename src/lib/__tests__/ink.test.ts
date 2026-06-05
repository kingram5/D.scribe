/**
 * Unit tests for src/lib/ink.ts
 *
 * All external I/O (Supabase) is mocked. No network calls are made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @/lib/supabase BEFORE importing the module under test.
// checkInk → ensureBalance → createServerClient() → .from().select()...
// We expose a factory so each test can configure the returned row.
// ---------------------------------------------------------------------------

const mockSingle = vi.fn();
const mockInsertSelect = vi.fn();
const mockInsert = vi.fn(() => ({ select: () => ({ single: mockInsertSelect }) }));
const mockSelect = vi.fn(() => ({ eq: () => ({ single: mockSingle }) }));
const mockFrom = vi.fn(() => ({ select: mockSelect, insert: mockInsert }));
const mockClient = { from: mockFrom };

vi.mock("@/lib/supabase", () => ({
  createServerClient: vi.fn(() => mockClient),
}));

// Import AFTER mocks are in place.
import { estimateInkCost, checkInk } from "@/lib/ink";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed the mock so ensureBalance returns a pre-existing row. */
function seedBalance(ink_balance: number, tier = "free", lifetime_used = 0) {
  mockSingle.mockResolvedValue({ data: { ink_balance, tier, lifetime_used }, error: null });
}

// ---------------------------------------------------------------------------
// estimateInkCost — pure, no I/O
// ---------------------------------------------------------------------------

describe("estimateInkCost", () => {
  it("returns 2 for brainstorm", () => {
    expect(estimateInkCost("brainstorm")).toBe(2);
  });

  it("returns 6 for generate (most expensive op)", () => {
    expect(estimateInkCost("generate")).toBe(6);
  });

  it("returns 3 for analyze", () => {
    expect(estimateInkCost("analyze")).toBe(3);
  });

  it("returns 1 for enrich (cheapest op)", () => {
    expect(estimateInkCost("enrich")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// checkInk — async, depends on ensureBalance/supabase
// ---------------------------------------------------------------------------

describe("checkInk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- balance <= 0 ---

  it("denies when balance is exactly 0 (presence check, no operation)", async () => {
    seedBalance(0);
    const result = await checkInk("user-zero");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/No Ink remaining/);
    expect(result.balance).toBe(0);
  });

  it("denies when balance is negative", async () => {
    seedBalance(-5);
    const result = await checkInk("user-negative");
    expect(result.allowed).toBe(false);
  });

  // --- balance < required ---

  it("denies when balance (1) is below operation floor for analyze (3)", async () => {
    seedBalance(1);
    const result = await checkInk("user-poor", "analyze");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/3 Ink/);
    expect(result.reason).toMatch(/1/); // shows actual balance
  });

  it("denies when balance equals (5) but operation is generate (6)", async () => {
    seedBalance(5);
    const result = await checkInk("user-almost", "generate");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/6 Ink/);
  });

  // --- allowed ---

  it("allows when balance exactly equals operation floor (brainstorm needs 2, has 2)", async () => {
    seedBalance(2);
    const result = await checkInk("user-exact", "brainstorm");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.balance).toBe(2);
  });

  it("allows when balance well exceeds operation floor", async () => {
    seedBalance(100);
    const result = await checkInk("user-rich", "generate");
    expect(result.allowed).toBe(true);
  });

  it("allows presence check (no operation) when balance > 0", async () => {
    seedBalance(0.01);
    const result = await checkInk("user-tiny");
    expect(result.allowed).toBe(true);
  });

  // --- return shape ---

  it("result includes tier from the stored row", async () => {
    seedBalance(50, "pro");
    const result = await checkInk("user-pro", "outline");
    expect(result.tier).toBe("pro");
  });
});
