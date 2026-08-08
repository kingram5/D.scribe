import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// GET /api/google-drive/callback — completes the Drive OAuth dance, stores the
// refresh token, and bounces back to the project's Export step which resumes
// the export automatically (?drive=connected).

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state") || "";
  const nonceCookie = req.cookies.get("gd_oauth_nonce")?.value;

  let state: { projectId?: string; nonce?: string } = {};
  try {
    state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
  } catch {
    /* handled below */
  }

  const backTo = state.projectId
    ? `${req.nextUrl.origin}/project/${state.projectId}/export`
    : `${req.nextUrl.origin}/dashboard`;

  if (!code || !state.nonce || !nonceCookie || state.nonce !== nonceCookie) {
    return NextResponse.redirect(`${backTo}?drive=error`);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${req.nextUrl.origin}/api/google-drive/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    logger.error("Drive OAuth token exchange failed", {
      route: "/api/google-drive/callback",
      userId: user.id,
      meta: { status: tokenRes.status, body: (await tokenRes.text()).slice(0, 300) },
    });
    return NextResponse.redirect(`${backTo}?drive=error`);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const supabase = createServerClient();
  // prompt=consent means a refresh_token arrives on every connect; if Google
  // ever omits it, keep the one already stored — and if there ISN'T one stored,
  // this grant is unusable (no durable credential), so bounce to reconnect.
  if (!tokens.refresh_token) {
    const { data: existing } = await supabase
      .from("google_drive_tokens")
      .select("refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!existing?.refresh_token) {
      return NextResponse.redirect(`${backTo}?drive=error`);
    }
  }
  const row: Record<string, unknown> = {
    user_id: user.id,
    access_token: tokens.access_token,
    access_token_expires_at: new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (tokens.refresh_token) row.refresh_token = tokens.refresh_token;

  const { error: dbError } = await supabase
    .from("google_drive_tokens")
    .upsert(row, { onConflict: "user_id" });

  if (dbError) {
    logger.error("Drive token store failed", {
      route: "/api/google-drive/callback",
      userId: user.id,
      error: dbError,
    });
    return NextResponse.redirect(`${backTo}?drive=error`);
  }

  const res = NextResponse.redirect(`${backTo}?drive=connected`);
  res.cookies.delete("gd_oauth_nonce");
  return res;
}
