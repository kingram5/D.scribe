import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Authenticated server client (reads session from cookies, respects RLS)
// Use this in API routes and server components where user context matters
// MUST be in a separate file from supabase.ts to avoid "next/headers" import in client components
export async function createAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Can't set cookies in Server Components
          }
        },
      },
    }
  );
}
