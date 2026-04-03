import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/allowlist";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  // Validate redirect: must be a relative path, not a protocol-relative URL
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  const origin = request.nextUrl.origin;

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
        return NextResponse.redirect(`${origin}/unauthorized`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — redirect to login
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
