import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/allowlist";
import { safeNextPath } from "@/lib/auth-redirect";

// POST /api/auth/hash-session — finishes a sign-in whose email link used
// Supabase's default {{ .ConfirmationURL }}. Those links verify at Supabase and
// land on /auth/confirm with the session in the URL hash, which the server never
// sees. /auth/confirm hands the hash tokens here; setSession validates them with
// Supabase (forged or expired tokens are rejected) and we write the cookies.
export async function POST(req: NextRequest) {
  let accessToken = "";
  let refreshToken = "";
  let next = "/dashboard";
  try {
    const body = await req.json();
    accessToken = typeof body.access_token === "string" ? body.access_token : "";
    refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
    next = safeNextPath(body.next);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!accessToken || !refreshToken || accessToken.length > 8192 || refreshToken.length > 1024) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) {
    return NextResponse.json({ error: "Sign-in link expired" }, { status: 401 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!isAllowedEmail(user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.json({ redirect: "/unauthorized" });
  }
  return NextResponse.json({ redirect: next });
}
