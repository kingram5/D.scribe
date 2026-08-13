import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/allowlist";
import {
  safeNextPath,
  safeVercelShareToken,
  urlOnRequestHost,
} from "@/lib/auth-redirect";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "signup" | "email" | null;
  const next = safeNextPath(searchParams.get("next"));
  const vercelShare = safeVercelShareToken(searchParams.get("_vercel_share"));

  if (token_hash && type) {
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

    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isAllowedEmail(user?.email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(urlOnRequestHost(request, "/unauthorized", vercelShare));
      }
      return NextResponse.redirect(urlOnRequestHost(request, next, vercelShare));
    }
  }

  const loginUrl = urlOnRequestHost(request, "/login", vercelShare);
  loginUrl.searchParams.set("error", "auth");
  loginUrl.searchParams.set("message", "Email confirmation failed. Please try again.");
  return NextResponse.redirect(loginUrl);
}
