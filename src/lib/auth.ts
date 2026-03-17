import { createAuthClient } from "@/lib/supabase-auth";

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
