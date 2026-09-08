/**
 * Sign-in gate.
 *
 * Two modes, chosen by env at call time (no module-level caching, so a Vercel
 * env change takes effect on the next request without a redeploy of code):
 *
 *   PUBLIC_SIGNUP=true   → anyone can sign in. This is the customer-facing
 *                          switch (launch hardening, 2026-09-08). Flip it in
 *                          Vercel → Production once transactional email (custom
 *                          SMTP in Supabase Auth) is configured, otherwise the
 *                          built-in mailer's hourly cap will swallow magic links.
 *   otherwise            → beta allowlist. ALLOWED_EMAILS is a comma-separated
 *                          list; an empty list denies everyone.
 */

export function isPublicSignup(): boolean {
  return (process.env.PUBLIC_SIGNUP ?? "").trim().toLowerCase() === "true";
}

function getAllowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Returns true if sign-in is open to the public, or the email is on the beta
 * allowlist. With no PUBLIC_SIGNUP and no list configured, denies everyone.
 */
export function isAllowedEmail(email: string | undefined | null): boolean {
  if (isPublicSignup()) return Boolean(email && email.includes("@"));
  const allowed = getAllowedEmails();
  if (allowed.size === 0) return false; // no allowlist = deny all (beta mode)
  if (!email) return false;
  return allowed.has(email.toLowerCase());
}
