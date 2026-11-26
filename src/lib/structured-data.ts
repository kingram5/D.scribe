// schema.org JSON-LD for the public site, in one place (SEO/GEO plan Phase 2,
// 2026-11-14). Before this, home, pricing and about each carried their own
// differently-shaped Organization block, none with a logo, sameAs or @id, and
// about's offer prices were hard-coded.
//
// One Organization and one WebSite node, emitted by the root layout on every
// page with stable @ids; page-level nodes point at them by @id rather than
// repeating them. Prices come from PLANS, so the structured data follows the
// plan-set flag the same day the visible cards do.
//
// Rules:
// - No aggregateRating or review until real reviews exist.
// - Founder: name only, plus the metro area as the Organization's location
//   (Kyle, 2026-11-14 lifted the 2026-09-19 no-personal-info rule for exactly
//   these two facts). No phone, address, headshot or other Person detail.
//   Not areaServed: D.scribe is web software sold everywhere, and areaServed
//   would read as a local-only service. Article authors stay the Organization.
// - sameAs lists only brand profiles verified to resolve publicly.
// - No SearchAction: the site has no search.
//
// Client-safe: constants and pure functions only.

import { SITE_URL } from "@/lib/site";
import { PLANS, INK_LIMITS, SELLABLE_TIERS, TIER_LABELS } from "@/lib/tiers";
import { BASED_IN, FOUNDER_NAME } from "@/lib/founder";

export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const APP_ID = `${SITE_URL}/#software`;

export const BRAND = "D.scribe";

/** One-sentence definition, shared by the Organization, the app and llms.txt. */
export const DEFINITION =
  "D.scribe is voice-to-manuscript software that turns the talks, sermons, and coaching sessions you have already recorded into a finished book, for speakers, pastors, and coaches.";

/**
 * Brand-owned public profiles, each checked 2026-11-14:
 * Instagram (profile page reads "D.Scribe (@dscribe.app)"), TikTok (profile
 * data carries uniqueId "dscribe.app"; a made-up handle carries none),
 * YouTube (channel "D-Scribe"; a made-up handle 404s), X (profile title
 * "T.H.E.O (@DScribe_ai)"). Facebook Page "D.Scribe" added 2026-11-14 once
 * its public contact details no longer showed a personal phone number.
 */
export const SAME_AS: readonly string[] = [
  "https://www.instagram.com/dscribe.app/",
  "https://www.tiktok.com/@dscribe.app",
  "https://www.youtube.com/@d-scribeadmin",
  "https://x.com/DScribe_ai",
  "https://www.facebook.com/profile.php?id=61594585703328",
];

export const SUPPORT_EMAIL = "kyle@d-scribe.app";

type Json = Record<string, unknown>;

export function organizationNode(): Json {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: BRAND,
    alternateName: ["D.Scribe", "DScribe"],
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/dscribe-d-logo.png`,
      width: 900,
      height: 700,
    },
    description: DEFINITION,
    foundingDate: "2025",
    founder: { "@type": "Person", name: FOUNDER_NAME },
    foundingLocation: { "@type": "Place", name: BASED_IN },
    location: { "@type": "Place", name: BASED_IN },
    email: SUPPORT_EMAIL,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: SUPPORT_EMAIL,
      availableLanguage: "English",
    },
    sameAs: [...SAME_AS],
  };
}

export function websiteNode(): Json {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: BRAND,
    url: SITE_URL,
    inLanguage: "en-US",
    publisher: { "@id": ORG_ID },
  };
}

/** The site-wide graph: rendered once by the root layout. */
export function siteGraph(): Json {
  return { "@context": "https://schema.org", "@graph": [organizationNode(), websiteNode()] };
}

export function planOffers(): Json[] {
  const free: Json = {
    "@type": "Offer",
    name: "Free trial",
    description: `${INK_LIMITS.free} Ink to start. No payment required.`,
    price: "0.00",
    priceCurrency: "USD",
    url: `${SITE_URL}/pricing`,
    availability: "https://schema.org/InStock",
  };
  // Only the plans a new customer can buy (one, under NEXT_PUBLIC_PLAN_99).
  const paid = SELLABLE_TIERS.map((key) => {
    const plan = PLANS[key];
    const name = TIER_LABELS[key];
    return {
      "@type": "Offer",
      name: `${name} plan`,
      description: `${plan.ink.toLocaleString("en-US")} Ink per month (${plan.books}).`,
      price: plan.price.toFixed(2),
      priceCurrency: "USD",
      url: `${SITE_URL}/pricing`,
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: plan.price.toFixed(2),
        priceCurrency: "USD",
        billingDuration: 1,
        unitCode: "MON",
      },
    };
  });
  return [free, ...paid];
}

/** The product itself, on home and pricing. No aggregateRating: no real reviews yet. */
export function softwareApplicationNode(): Json {
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: BRAND,
    url: SITE_URL,
    description:
      "Upload sermons, talks, coaching calls, podcast episodes or a YouTube link, or get interviewed by T.H.E.O, the built-in AI interviewer. D.scribe transcribes the audio, builds a voice profile from how you talk, drafts a structured manuscript chapter by chapter, and exports it to PDF or DOCX.",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "AI book writing (voice to manuscript)",
    operatingSystem: "Web",
    publisher: { "@id": ORG_ID },
    offers: planOffers(),
  };
}

export function webPageNode(opts: { path: string; name: string; description: string; type?: string; about?: string }): Json {
  const url = opts.path === "/" ? SITE_URL : `${SITE_URL}${opts.path}`;
  return {
    "@type": opts.type ?? "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: opts.name,
    description: opts.description,
    isPartOf: { "@id": WEBSITE_ID },
    ...(opts.about ? { about: { "@id": opts.about } } : {}),
  };
}

/** Breadcrumbs from the home page down. Every crumb is a real, linkable URL. */
export function breadcrumbNode(crumbs: readonly { name: string; path: string }[]): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: BRAND, path: "/" }, ...crumbs].map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.path === "/" ? SITE_URL : `${SITE_URL}${c.path}`,
    })),
  };
}

export function articleNode(opts: {
  path: string;
  headline: string;
  description?: string | null;
  datePublished: string;
  dateModified?: string | null;
  keywords?: readonly string[] | null;
}): Json {
  const url = `${SITE_URL}${opts.path}`;
  return {
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: opts.headline.slice(0, 110),
    ...(opts.description ? { description: opts.description } : {}),
    url,
    mainEntityOfPage: url,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    image: `${SITE_URL}/opengraph-image`,
    ...(opts.keywords && opts.keywords.length ? { keywords: opts.keywords.join(", ") } : {}),
    isPartOf: { "@id": WEBSITE_ID },
  };
}

/** Wrap page nodes in one @graph for a single <script type="application/ld+json">. */
export function graph(...nodes: Json[]): Json {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/** Serialise for dangerouslySetInnerHTML; escapes "<" so content can never close the script tag. */
export function jsonLd(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
