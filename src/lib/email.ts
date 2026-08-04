// Shared email canonicalisation for deny-side controls: rate-limit keys,
// the disposable-domain blocklist, and the delete-and-resignup anti-farming
// hash. Gmail ignores dots in the local part and everything after "+", and
// most providers honour "+" tags — so without canonicalisation one inbox
// mints unlimited distinct identities against every one of those controls.
//
// Deliberately NOT used for the allowlist: an unrecognised alias there simply
// fails to match and is denied (fail-closed), so canonicalising would loosen
// it, not tighten it.

const DOT_INSENSITIVE_DOMAINS = new Set(["gmail.com"]);

export function canonicalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at === -1) return trimmed;
  let local = trimmed.slice(0, at);
  // "example.com." is the same host as "example.com"
  let domain = trimmed.slice(at + 1).replace(/\.+$/, "");
  if (domain === "googlemail.com") domain = "gmail.com";
  const plus = local.indexOf("+");
  if (plus !== -1) local = local.slice(0, plus);
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}
