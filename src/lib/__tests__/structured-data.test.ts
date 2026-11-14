import { describe, it, expect } from "vitest";
import {
  ORG_ID, WEBSITE_ID, APP_ID, SAME_AS,
  siteGraph, softwareApplicationNode, breadcrumbNode, articleNode, webPageNode, graph, jsonLd,
} from "../structured-data";
import { llmsTxt, llmsFullTxt } from "../llms";
import { PLANS } from "../tiers";
import { SITE_URL } from "../site";

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

  it("carries no founder/Person data (site-wide no-personal-info rule) and no SearchAction", () => {
    const s = JSON.stringify(siteGraph());
    expect(s).not.toMatch(/"founder"|"Person"|SearchAction/);
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

  it("repeats no unsourced ghostwriter cost figure", () => {
    for (const s of [short, full]) expect(s).not.toMatch(/\$10,000|\$30,000|\$50,000|\$80,000/);
  });
});
