/**
 * Unit tests for src/lib/allowlist.ts
 *
 * isAllowedEmail reads process.env.ALLOWED_EMAILS at call-time (no module-level
 * caching), so we can control the allowlist by setting/restoring the env var.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAllowedEmail } from "@/lib/allowlist";

const ORIGINAL = process.env.ALLOWED_EMAILS;

function setAllowlist(csv: string) {
  process.env.ALLOWED_EMAILS = csv;
}

afterEach(() => {
  // Restore env after each test
  if (ORIGINAL === undefined) {
    delete process.env.ALLOWED_EMAILS;
  } else {
    process.env.ALLOWED_EMAILS = ORIGINAL;
  }
});

describe("isAllowedEmail", () => {
  it("returns false when ALLOWED_EMAILS is empty string (beta deny-all)", () => {
    setAllowlist("");
    expect(isAllowedEmail("anyone@example.com")).toBe(false);
  });

  it("returns false when ALLOWED_EMAILS is not set (undefined → deny all)", () => {
    delete process.env.ALLOWED_EMAILS;
    expect(isAllowedEmail("anyone@example.com")).toBe(false);
  });

  it("returns true for an exact match", () => {
    setAllowlist("kyle@d-scribe.app");
    expect(isAllowedEmail("kyle@d-scribe.app")).toBe(true);
  });

  it("returns true case-insensitively (input uppercase, list lowercase)", () => {
    setAllowlist("kyle@d-scribe.app");
    expect(isAllowedEmail("KYLE@D-SCRIBE.APP")).toBe(true);
  });

  it("returns true case-insensitively (input lowercase, list uppercase)", () => {
    setAllowlist("KYLE@D-SCRIBE.APP");
    expect(isAllowedEmail("kyle@d-scribe.app")).toBe(true);
  });

  it("returns false for a non-matching email when allowlist is populated", () => {
    setAllowlist("kyle@d-scribe.app");
    expect(isAllowedEmail("stranger@example.com")).toBe(false);
  });

  it("handles multiple emails in the list and matches the second one", () => {
    setAllowlist("first@test.com, second@test.com, third@test.com");
    expect(isAllowedEmail("second@test.com")).toBe(true);
  });

  it("returns false for undefined email input", () => {
    setAllowlist("kyle@d-scribe.app");
    expect(isAllowedEmail(undefined)).toBe(false);
  });

  it("returns false for null email input", () => {
    setAllowlist("kyle@d-scribe.app");
    expect(isAllowedEmail(null)).toBe(false);
  });
});
