/**
 * Beta allowlist — restricts login to approved test users only.
 * Set ALLOWED_EMAILS in .env.local as a comma-separated list.
 * Remove this module when going public.
 */

const ALLOWED_EMAILS: Set<string> = new Set(
  (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

/** Returns true if the email is on the beta allowlist, or if no allowlist is configured. */
export function isAllowedEmail(email: string | undefined | null): boolean {
  if (ALLOWED_EMAILS.size === 0) return true; // no restriction if env var is empty
  if (!email) return false;
  return ALLOWED_EMAILS.has(email.toLowerCase());
}
