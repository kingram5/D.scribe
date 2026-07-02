// Disposable/throwaway email domains blocked at signup (magic-link path).
// Not exhaustive — covers the high-volume providers that dominate trial farming.
// Google OAuth signups skip this check (a Google account is its own barrier).

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "sharklasers.com",
  "10minutemail.com",
  "10minutemail.net",
  "temp-mail.org",
  "tempmail.com",
  "tempmail.dev",
  "tempmailo.com",
  "throwawaymail.com",
  "yopmail.com",
  "yopmail.fr",
  "getnada.com",
  "nada.email",
  "maildrop.cc",
  "dispostable.com",
  "mintemail.com",
  "trashmail.com",
  "trashmail.de",
  "mailnesia.com",
  "mytemp.email",
  "mohmal.com",
  "fakeinbox.com",
  "spamgourmet.com",
  "mailcatch.com",
  "inboxkitten.com",
  "33mail.com",
  "emailondeck.com",
  "burnermail.io",
  "mailsac.com",
  "tempr.email",
  "discard.email",
  "spambog.com",
  "mail-temp.com",
  "tmpmail.net",
  "tmpmail.org",
  "moakt.com",
  "tmail.ws",
  "cs.email",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1];
  return !!domain && DISPOSABLE_DOMAINS.has(domain);
}
