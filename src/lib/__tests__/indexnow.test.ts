import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
// Plain .mjs script, shared with the GitHub Action (tsconfig allowJs resolves it).
import { INDEXNOW_KEY, buildPayload, sitemapUrls } from "../../../scripts/indexnow-ping.mjs";

const root = path.join(__dirname, "../../..");

describe("IndexNow", () => {
  it("serves the key file at the root with exactly the key", () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{32}$/);
    expect(fs.readFileSync(path.join(root, "public", `${INDEXNOW_KEY}.txt`), "utf8").trim()).toBe(INDEXNOW_KEY);
  });

  it("lists the key file in the middleware's public paths, or crawlers would get a 404", () => {
    const mw = fs.readFileSync(path.join(root, "src/middleware.ts"), "utf8");
    expect(mw).toContain(`"/${INDEXNOW_KEY}.txt"`);
  });

  it("reads only this host's URLs from the sitemap, deduplicated", () => {
    const xml = `<urlset><url><loc>https://www.d-scribe.app</loc></url><url><loc>https://www.d-scribe.app/pricing</loc></url>
      <url><loc>https://www.d-scribe.app/pricing</loc></url><url><loc>https://evil.example/x</loc></url><url><loc>https://www.d-scribe.app/a?x=1&amp;y=2</loc></url></urlset>`;
    expect(sitemapUrls(xml, "www.d-scribe.app")).toEqual(["https://www.d-scribe.app", "https://www.d-scribe.app/pricing", "https://www.d-scribe.app/a?x=1&y=2"]);
  });

  it("builds the documented payload with the key location on the same host", () => {
    expect(buildPayload("https://www.d-scribe.app/", ["https://www.d-scribe.app/pricing"])).toEqual({
      host: "www.d-scribe.app",
      key: INDEXNOW_KEY,
      keyLocation: `https://www.d-scribe.app/${INDEXNOW_KEY}.txt`,
      urlList: ["https://www.d-scribe.app/pricing"],
    });
  });

  it("the workflow only pings after a successful Production deployment (or by hand)", () => {
    const wf = fs.readFileSync(path.join(root, ".github/workflows/indexnow.yml"), "utf8");
    expect(wf).toMatch(/deployment_status/);
    expect(wf).toMatch(/environment == 'Production'/);
    expect(wf).toMatch(/state == 'success'/);
    expect(wf).not.toMatch(/secrets\./);
  });
});
