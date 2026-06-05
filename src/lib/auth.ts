import { createAuthClient } from "@/lib/supabase-auth";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

/** Get the authenticated user from the request cookie. Returns null if not logged in. */
export async function getUser() {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Get the authenticated user ID, or throw 401 */
export async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

/**
 * Auth guard for API route handlers.
 * Returns { user, error: null } on success, or { user: null, error: NextResponse(401) } if not authenticated.
 *
 * Usage:
 *   const { user, error } = await requireAuth();
 *   if (error) return error;
 */
export async function requireAuth(): Promise<
  | { user: User; error: null }
  | { user: null; error: NextResponse }
> {
  const user = await getUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  // Require a confirmed email — an unconfirmed Supabase session still returns a user.
  if (!user.email_confirmed_at) {
    return {
      user: null,
      error: NextResponse.json({ error: "Email not confirmed" }, { status: 403 }),
    };
  }
  return { user, error: null };
}
