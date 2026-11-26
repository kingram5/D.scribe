import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VercelAnalytics } from "@/components/analytics/VercelAnalytics";

// Vercel Web Analytics (growth dashboard, 2026-11-25): consent-gated like the
// pixels, rendered client-side only, wired once in the root layout.

describe("Vercel Web Analytics", () => {
  it("renders nothing on the server (no script before consent is read, no hydration mismatch)", () => {
    expect(renderToStaticMarkup(React.createElement(VercelAnalytics))).toBe("");
  });

  it("is mounted in the root layout and gated on the analytics choice", () => {
    const root = path.resolve(__dirname, "../../..");
    const layout = fs.readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
    expect(layout).toMatch(/<VercelAnalytics \/>/);
    const src = fs.readFileSync(path.join(root, "src/components/analytics/VercelAnalytics.tsx"), "utf8");
    expect(src).toMatch(/readConsent\(\)\?\.analytics !== false/);
    expect(src).toMatch(/CONSENT_EVENT/);
    expect(src).toMatch(/beforeSend/);
    expect(src).toMatch(/ssr: false/);
  });
});
