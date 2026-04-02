/**
 * Beta allowlist — restricts login to approved test users only.
 * Set ALLOWED_EMAILS in .env.local as a comma-separated list.
 * Remove this module when going public.
 */

function getAllowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Returns true if the email is on the beta allowlist. Denies by default if no list is configured. */
export function isAllowedEmail(email: string | undefined | null): boolean {
  const allowed = getAllowedEmails();
  if (allowed.size === 0) return false; // no allowlist = deny all (beta mode)
  if (!email) return false;
  return allowed.has(email.toLowerCase());
}
