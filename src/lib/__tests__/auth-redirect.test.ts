import { describe, expect, it } from "vitest";
import {
  magicLinkRedirectUrl,
  oauthCallbackUrl,
  oauthWouldLeaveStaging,
  pinAuthorizeUrlToOrigin,
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

  it("pins Google OAuth back onto the staging host instead of the live site", () => {
    const origin = "http://127.0.0.1:3000";
    const authorize = new URL("https://imjkauxdlwfrblrgidgj.supabase.co/auth/v1/authorize");
    authorize.searchParams.set("provider", "google");
    authorize.searchParams.set(
      "redirect_to",
      "https://d-scribe.app/auth/callback?next=/dashboard"
    );

    const pinned = pinAuthorizeUrlToOrigin(authorize.toString(), origin, "/dashboard");
    expect(pinned.redirectTo).toBe(
      "http://127.0.0.1:3000/auth/callback?next=%2Fdashboard"
    );
    expect(new URL(pinned.url).searchParams.get("redirect_to")).toBe(pinned.redirectTo);
    expect(oauthWouldLeaveStaging(origin, "https://d-scribe.app/auth/callback")).toBe(true);
    expect(oauthWouldLeaveStaging(origin, pinned.redirectTo)).toBe(false);
    expect(oauthCallbackUrl(origin, "/dashboard", "share-token").includes("_vercel_share=share-token")).toBe(true);
  });
});
