import { describe, expect, it } from "vitest";
import {
  magicLinkRedirectUrl,
  safeNextPath,
  urlOnRequestHost,
} from "@/lib/auth-redirect";

function request(
  internalUrl = "http://localhost:3000/api/auth/magic-link",
  headers: Record<string, string> = {}
) {
  return {
    headers: new Headers(headers),
    nextUrl: new URL(internalUrl),
  };
}

describe("preview auth redirects", () => {
  it("uses the visitor's forwarded preview host for emailRedirectTo", () => {
    const req = request(undefined, {
      "x-forwarded-host": "d-scribe-pr-42-kyles-projects-6adbe8c9.vercel.app",
      "x-forwarded-proto": "https",
    });

    const redirect = new URL(magicLinkRedirectUrl(req, "/studio"));

    expect(redirect.origin).toBe(
      "https://d-scribe-pr-42-kyles-projects-6adbe8c9.vercel.app"
    );
    expect(redirect.pathname).toBe("/auth/confirm");
    expect(redirect.searchParams.get("next")).toBe("/studio");
  });

  it("never accepts an absolute production URL as next", () => {
    expect(safeNextPath("https://dscribe.app/dashboard")).toBe("/dashboard");
    expect(safeNextPath("//dscribe.app/dashboard")).toBe("/dashboard");

    const redirect = new URL(
      magicLinkRedirectUrl(
        request("https://preview.example.com/api/auth/magic-link"),
        "https://dscribe.app/dashboard"
      )
    );
    expect(redirect.searchParams.get("next")).toBe("/dashboard");
  });

  it("preserves the Vercel share query through confirmation and final redirect", () => {
    const req = request("https://preview.example.com/api/auth/magic-link");
    const shareToken = "opaque-share-token";
    const confirmUrl = new URL(
      magicLinkRedirectUrl(req, "/project/123?tab=studio", shareToken)
    );

    expect(confirmUrl.searchParams.get("_vercel_share")).toBe(shareToken);

    const finalUrl = urlOnRequestHost(
      request("https://preview.example.com/auth/confirm"),
      confirmUrl.searchParams.get("next")!,
      confirmUrl.searchParams.get("_vercel_share")
    );
    expect(finalUrl.toString()).toBe(
      "https://preview.example.com/project/123?tab=studio&_vercel_share=opaque-share-token"
    );
  });
});
