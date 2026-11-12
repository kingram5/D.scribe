import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { APP_PREFIXES, isAppPath } from "../app-routes";

// The middleware 404s any anonymous path that is neither public nor an app route
// (2026-10-30). A new route folder that lands in neither list would 404 for
// anonymous visitors, so every top-level route must be accounted for here.
const APP_DIR = path.join(__dirname, "../../app");
const MIDDLEWARE = fs.readFileSync(path.join(__dirname, "../../middleware.ts"), "utf8");
const listFrom = (name: string) => {
  const m = MIDDLEWARE.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  if (!m) throw new Error(`${name} not found in middleware.ts`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
};
const PUBLIC_PATHS = listFrom("PUBLIC_PATHS");
const PUBLIC_PREFIXES = listFrom("PUBLIC_PREFIXES");
const covered = (p: string) =>
  PUBLIC_PATHS.includes(p) || PUBLIC_PREFIXES.some((x) => p.startsWith(x) || p + "/" === x) || isAppPath(p);

const isRoute = (dir: string) => ["page.tsx", "route.ts"].some((f) => fs.existsSync(path.join(dir, f)));
// Top-level route folders; a folder with no page of its own (e.g. /auth) is
// expanded to its children (/auth/callback, /auth/confirm).
const routeFolders = (dir: string, prefix = ""): string[] =>
  fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("(") && !d.name.startsWith("["))
    .flatMap((d) => {
      const full = path.join(dir, d.name), p = `${prefix}/${d.name}`;
      if (isRoute(full) || prefix) return [p];
      const kids = routeFolders(full, p);
      return kids.length ? kids : [p];
    });

describe("app routes vs the middleware's 404 rule", () => {
  it("every top-level route folder is public or an app route", () => {
    const folders = [...routeFolders(APP_DIR), ...routeFolders(path.join(APP_DIR, "(main)"))]
      // api has its own matcher exclusion; dev pages 404 in production by design
      .filter((p) => p !== "/api" && !p.startsWith("/dev/"));
    const missing = folders.filter((p) => !covered(p));
    expect(missing).toEqual([]);
  });

  it("matches whole path segments only", () => {
    expect(isAppPath("/dashboard")).toBe(true);
    expect(isAppPath("/project/abc/chapter/2")).toBe(true);
    expect(isAppPath("/partner/payouts")).toBe(true);
    expect(isAppPath("/partners")).toBe(false); // the public apply page
    expect(isAppPath("/projects-old")).toBe(false);
    expect(isAppPath("/this-page-does-not-exist")).toBe(false);
  });

  it("app routes are not also public", () => {
    for (const p of APP_PREFIXES) expect(PUBLIC_PATHS).not.toContain(p);
  });
});
