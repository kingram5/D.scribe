import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/allowlist";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const REDIRECT_URI = "https://d-scribe.app/auth/google/callback";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const rawNext = searchParams.get("state") ?? "/dashboard";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
  const origin = request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  // Exchange Google auth code for tokens
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();

  if (!tokens.id_token) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  // Sign into Supabase using the Google ID token
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: tokens.id_token,
    access_token: tokens.access_token,
  });

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  // Beta allowlist check
  if (!isAllowedEmail(data.user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/unauthorized`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
