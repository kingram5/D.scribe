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
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const vercelShare = safeVercelShareToken(searchParams.get("_vercel_share"));

  if (code) {
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

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Beta allowlist check — reject users not on the list
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
  return NextResponse.redirect(loginUrl);
}
