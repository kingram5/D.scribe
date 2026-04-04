import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Inline allowlist check for Edge Runtime compatibility */
function isAllowedEmail(email: string | undefined | null): boolean {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  const allowed = new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
  if (allowed.size === 0) return false;
  if (!email) return false;
  return allowed.has(email.toLowerCase());
}

const PUBLIC_PATHS = ["/", "/login", "/auth/callback", "/auth/confirm", "/unauthorized", "/cinematic", "/landing-classic"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and API routes
  if (PUBLIC_PATHS.some((p) => pathname === p) || pathname.startsWith("/api/")) {
    // For root path, check if user is authenticated → redirect to dashboard
    if (pathname === "/") {
      let response = NextResponse.next({ request: { headers: request.headers } });
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return request.cookies.getAll(); },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
              response = NextResponse.next({ request: { headers: request.headers } });
              cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
            },
          },
        }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Beta allowlist — bounce users not on the approved list
  if (!isAllowedEmail(user.email)) {
    const url = request.nextUrl.clone();
    url.pathname = "/unauthorized";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files and API routes
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.mp4$|.*\\.webm$|.*\\.jpg$|.*\\.png$|.*\\.svg$|.*\\.ico$).*)",
  ],
};
