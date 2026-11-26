// GROWTH_VIEWER_EMAILS: read-only viewers of the growth dashboard (Kyle
// 2026-11-25, so Chiara can see it without admin powers). Comma list, exact
// lowercase match: no dot/plus folding, no wildcard, no domain match.
// Dependency-free so the signup-question route can use it too.

export function growthViewerEmails(raw: string | undefined = process.env.GROWTH_VIEWER_EMAILS): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );
}

export function isGrowthViewer(email: string | null | undefined): boolean {
  if (!email) return false;
  return growthViewerEmails().has(email.trim().toLowerCase());
}
