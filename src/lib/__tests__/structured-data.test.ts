import { describe, it, expect } from "vitest";
import {
  ORG_ID, WEBSITE_ID, APP_ID, SAME_AS,
  siteGraph, softwareApplicationNode, breadcrumbNode, articleNode, webPageNode, graph, jsonLd,
} from "../structured-data";
import { llmsTxt, llmsFullTxt } from "../llms";
import { PLANS } from "../tiers";
import { SITE_URL } from "../site";
import { GHOSTWRITER_COST } from "../ghostwriter-cost";
import { DIFFERENTIATORS } from "../about-content";
import fs from "fs";
import path from "path";

const nodes = (g: Record<string, unknown>) => g["@graph"] as Record<string, unknown>[];

describe("site graph (root layout)", () => {
  const [org, site] = nodes(siteGraph());

  it("has one Organization and one WebSite with stable @ids on www", () => {
    expect(org["@type"]).toBe("Organization");
    expect(org["@id"]).toBe(ORG_ID);
    expect(site["@type"]).toBe("WebSite");
    expect(site["@id"]).toBe(WEBSITE_ID);
    expect(String(org.url)).toBe("https://www.d-scribe.app");
    expect((site.publisher as { "@id": string })["@id"]).toBe(ORG_ID);
  });

  it("carries a logo and only https brand-profile sameAs links", () => {
    expect((org.logo as { url: string }).url).toBe(`${SITE_URL}/dscribe-d-logo.png`);
    expect(org.sameAs).toEqual([...SAME_AS]);
    for (const u of SAME_AS) expect(u).toMatch(/^https:\/\//);
  });

  it("names the founder and metro only, with no other personal detail (Kyle 2026-11-14), and no SearchAction", () => {
    expect(org.founder).toEqual({ "@type": "Person", name: "Kyle Ingram" });
    expect(org.location).toEqual({ "@type": "Place", name: "Dallas-Fort Worth" });
    expect(org.foundingLocation).toEqual({ "@type": "Place", name: "Dallas-Fort Worth" });
    const s = JSON.stringify(siteGraph());
    expect(s).not.toMatch(/telephone|streetAddress|postalCode|"image"|"areaServed"|SearchAction/);
    expect(s).not.toMatch(/714|469-8951/);
  });
});

describe("SoftwareApplication", () => {
  const app = softwareApplicationNode();

  it("prices every paid offer from PLANS, plus a free trial", () => {
    const offers = app.offers as { name: string; price: string; priceCurrency: string }[];
    expect(offers.map((o) => o.price)).toEqual([
      "0.00",
      PLANS.starter.price.toFixed(2),
      PLANS.pro.price.toFixed(2),
      PLANS.premium.price.toFixed(2),
    ]);
    for (const o of offers) expect(o.priceCurrency).toBe("USD");
  });

  it("has the fields Google reads and never a fabricated rating", () => {
    expect(app["@id"]).toBe(APP_ID);
    expect(app.operatingSystem).toBe("Web");
    expect(app.applicationCategory).toBeTruthy();
    expect(JSON.stringify(app)).not.toMatch(/aggregateRating|"review"/);
  });
});

describe("page nodes", () => {
  it("breadcrumbs start at home and every crumb has an absolute item URL", () => {
    const b = breadcrumbNode([{ name: "Terms of Service", path: "/legal/terms" }]);
    const items = b.itemListElement as { position: number; item: string }[];
    expect(items.map((i) => i.position)).toEqual([1, 2]);
    expect(items.map((i) => i.item)).toEqual([SITE_URL, `${SITE_URL}/legal/terms`]);
  });

  it("articles are authored by the Organization, with dates", () => {
    const a = articleNode({ path: "/blog/x", headline: "X", datePublished: "2026-11-01" });
    expect(a.author).toEqual({ "@id": ORG_ID });
    expect(a.dateModified).toBe("2026-11-01");
  });

  it("web pages link to the WebSite", () => {
    const p = webPageNode({ path: "/pricing", name: "P", description: "D", about: APP_ID });
    expect(p.isPartOf).toEqual({ "@id": WEBSITE_ID });
    expect(p.url).toBe(`${SITE_URL}/pricing`);
  });

  it("jsonLd output is valid JSON and cannot close the script tag", () => {
    const html = jsonLd(graph({ "@type": "Thing", name: "</script><script>alert(1)</script>" })).__html;
    expect(html).not.toContain("</script>");
    expect(JSON.parse(html)["@graph"][0].name).toContain("</script>");
  });
});

describe("llms.txt", () => {
  const short = llmsTxt();
  const full = llmsFullTxt();
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

  it("stays under 2,000 words and starts with an H1 + summary blockquote", () => {
    expect(words(short)).toBeLessThan(2000);
    expect(short.startsWith("# D.scribe\n\n> ")).toBe(true);
  });

  it("states the real plan prices", () => {
    for (const k of ["starter", "pro", "premium"] as const) {
      expect(short).toContain(`$${PLANS[k].price}/month`);
      expect(full).toContain(`$${PLANS[k].price}/month`);
    }
  });

  it("links only to the canonical www host", () => {
    for (const s of [short, full]) {
      expect(s).not.toMatch(/https:\/\/d-scribe\.app/);
      expect(s).toContain("https://www.d-scribe.app/pricing");
    }
  });

  it("names the founder and metro", () => {
    for (const s of [short, full]) expect(s).toContain("founded in 2025 by Kyle Ingram and is based in Dallas-Fort Worth");
  });

  it("quotes only the one sourced ghostwriter range, with its source", () => {
    expect(full).toContain(GHOSTWRITER_COST.range);
    expect(full).toContain(GHOSTWRITER_COST.url);
    for (const s of [short, full]) expect(s).not.toMatch(/\$10,000|\$30,000|\$80,000/);
  });
});

describe("ghostwriter cost figure (one sourced range, Kyle 2026-11-14)", () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, "../..", p), "utf8");
  const files = ["app/pricing/page.tsx", "app/pricing/opengraph-image.tsx", "lib/about-content.ts"];

  it("every page that quotes a ghostwriter cost uses the shared constant", () => {
    for (const f of files) expect(read(f)).toMatch(/GHOSTWRITER_COST/);
  });

  it("no old unsourced figures remain where they used to live", () => {
    for (const f of files) expect(read(f)).not.toMatch(/\$10,000|30,000|80,000|12&ndash;24|12 to 24 months/);
  });

  it("the source is a real https URL", () => {
    expect(GHOSTWRITER_COST.url).toMatch(/^https:\/\/reedsy\.com\//);
  });

  it("/about's comparison keeps the dollar sign on the plan price", () => {
    const d = DIFFERENTIATORS.find((x) => /ghostwriter/i.test(x.title))!;
    expect(d.body).toContain(`${GHOSTWRITER_COST.range} for a nonfiction book`);
    expect(d.body).toContain(`starts at $${PLANS.starter.price} per month`);
    expect(d.source?.url).toBe(GHOSTWRITER_COST.url);
  });
});

describe("sameAs", () => {
  it("includes the D.Scribe Facebook Page (added 2026-11-14)", () => {
    expect(SAME_AS).toContain("https://www.facebook.com/profile.php?id=61594585703328");
  });
});
