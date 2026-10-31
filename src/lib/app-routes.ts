// The signed-in app, for the middleware. An anonymous visitor on one of these
// paths is sent to /login?next=...
// 2026-10-30: every OTHER unknown path used to get the same bounce, so a dead
// link answered 307 -> /login (200) and Google saw a login page where it should
// have seen a 404. Paths outside this list and the middleware's public lists now
// get the real not-found page with a 404. Fails closed: a gated route left off
// this list 404s for anonymous visitors, it never opens up.
// Keep in step with the folders under src/app/(main) plus /upgrade; the
// app-routes test fails when a new top-level route folder is in neither list.
export const APP_PREFIXES = ["/dashboard", "/project", "/settings", "/admin", "/partner", "/upgrade"];

export function isAppPath(pathname: string): boolean {
  return APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
