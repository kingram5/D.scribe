import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";

/** True when the app has a real Supabase project, not a local placeholder. */
export function isAuthConfigured(
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): boolean {
  if (!url || !key) return false;
  if (/placeholder/i.test(url) || /placeholder/i.test(key)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

// One browser client per page load. Every useAuth() mount (dashboard page +
// UserMenu, etc.) used to build its own client, and each fired its own
// GET /auth/v1/user — Sentry DSCRIBE-10 counted 6 per dashboard load.
let browserClient: SupabaseClient | null = null;

// Browser client (used in "use client" components — handles auth cookies for OAuth/PKCE)
export function createBrowserClient(): SupabaseClient {
  // Never cache during server rendering: a module-level client there would be
  // shared across requests.
  if (typeof window === "undefined") {
    return createSSRBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  if (!browserClient) {
    browserClient = createSSRBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return browserClient;
}

// Service role client (bypasses RLS — use ONLY for background workers and admin ops)
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
