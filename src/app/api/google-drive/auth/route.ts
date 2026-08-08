import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import crypto from "crypto";

// GET /api/google-drive/auth?project_id=... — kick off incremental OAuth for
// Drive access. Scope is drive.file only: the app can touch files IT creates,
// never the rest of the user's Drive. redirect_uri derives from the request
// origin so dev and prod both work without extra env.

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const projectId = req.nextUrl.searchParams.get("project_id") || "";
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 });
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ projectId, nonce })).toString("base64url");
  const redirectUri = `${req.nextUrl.origin}/api/google-drive/callback`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/drive.file");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent"); // guarantees a refresh_token
  url.searchParams.set("state", state);
  url.searchParams.set("login_hint", user.email ?? "");

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("gd_oauth_nonce", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/google-drive",
  });
  return res;
}
