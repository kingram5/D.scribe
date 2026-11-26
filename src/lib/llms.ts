// /llms.txt and /llms-full.txt: plain-Markdown briefings for AI assistants and
// answer engines (llmstxt.org format; SEO/GEO plan Phase 2, 2026-11-14).
//
// Built from the same constants the pages render (PLANS, the FAQ, the /about
// content, the /vs data), so a price or claim changes here the moment it
// changes on the site. Rules: no invented stats, quotes, awards or reviews;
// personal info limited to the founder's name and metro area (Kyle,
// 2026-11-14); canonical www links only. The ghostwriter cost figure is the one
// sourced range in src/lib/ghostwriter-cost.ts, always given with its source.

import { SITE_URL } from "@/lib/site";
import { PLANS, INK_LIMITS, INK_PER_PUBLISHER_READY_BOOK, PLAN_99, plan99 } from "@/lib/tiers";
import { FAQ_ITEMS } from "@/components/landing/faq";
import { VS_PAGES, D_SCRIBE_PRICING, SOURCED_NOTE } from "@/lib/vs-pages";
import { DIFFERENTIATORS, FOUNDING_LINE, HOW_IT_WORKS, KEY_FACTS, WHO_USES } from "@/lib/about-content";
import { DEFINITION, SUPPORT_EMAIL } from "@/lib/structured-data";

const url = (path: string) => (path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`);

// Shown on /pricing as "Every plan includes".
const INCLUDED = ["AI transcription", "voice profile", "chapter generation", "AI coherence pass", "enrichment quotes", "priority generation", "PDF / DOCX export"];

const WHAT_IT_DOES =
  "D.scribe (also written D.Scribe) is web software. You upload recordings you already have, such as sermons, keynotes, coaching calls, podcast episodes or voice memos (MP3, MP4, WAV, M4A, or a YouTube link), or you talk with T.H.E.O, the built-in AI interviewer. D.scribe transcribes the audio, builds a voice profile from how you speak, plans the book's structure, drafts the manuscript chapter by chapter, and runs a coherence pass across the whole book. Every sentence lands in a built-in manuscript editor, and the finished book exports to PDF or DOCX.";

function pricingLines(): string[] {
  const p = PLANS;
  if (plan99()) {
    // One plan (Kyle 2026-11-19). No Studio minutes: those wait for THEO Live.
    return [
      `- Free trial: ${INK_LIMITS.free} Ink to start. No payment required.`,
      `- One plan, ${PLAN_99.name}: $${PLAN_99.price}/month with ${PLAN_99.ink.toLocaleString("en-US")} Ink a month, enough for one Publisher-Ready book. A 40,000-word book taken through Publisher-Ready (drafted, read by an editor, your answers to the editor's questions worked in, then a final check) runs about ${INK_PER_PUBLISHER_READY_BOOK.toLocaleString("en-US")} Ink; the rest covers that month's interviews with T.H.E.O. Voice playback, where T.H.E.O reads his replies aloud, is included.`,
      `- The plan includes the full toolkit: ${INCLUDED.join(", ")}.`,
      "- One-time Ink and voice refills start at $20 and never expire.",
      "- Month to month, cancel anytime. Ink is D.scribe's credit system: every AI action costs Ink, and the cost is shown before it runs.",
    ];
  }
  return [
    `- Free trial: ${INK_LIMITS.free} Ink to start. No payment required.`,
    `- Starter: $${p.starter.price}/month, ${p.starter.ink.toLocaleString("en-US")} Ink (${p.starter.books}).`,
    `- Pro: $${p.pro.price}/month, ${p.pro.ink.toLocaleString("en-US")} Ink (${p.pro.books}), plus about 30 minutes a month of spoken brainstorming with T.H.E.O.`,
    `- Premium: $${p.premium.price}/month, ${p.premium.ink.toLocaleString("en-US")} Ink (${p.premium.books}), plus about 80 minutes a month of spoken brainstorming.`,
    `- Every plan includes the full toolkit: ${INCLUDED.join(", ")}. Plans differ only on capacity.`,
    "- One-time Ink and voice refills start at $20 and never expire.",
    "- Month to month, cancel anytime. Ink is D.scribe's credit system: every AI action costs Ink, and the cost is shown before it runs.",
  ];
}

const KEY_PAGES: readonly [string, string, string][] = [
  ["Home", "/", "What D.scribe does, how it works, and the FAQ."],
  ["Pricing", "/pricing", "Plans, what Ink is, and what one book costs."],
  ["About", "/about", "Why D.scribe exists, who uses it, how it works, and key facts."],
  ["Compare D.scribe", "/vs", "Side-by-side comparisons with other book tools and services."],
  ["Partner program", "/partners", "For speakers, pastors, coaches and podcasters who want to share D.scribe."],
  ["Refund and cancellation policy", "/legal/refunds", "How cancelling and refunds work."],
  ["Terms of Service", "/legal/terms", "The legal terms."],
  ["Privacy Policy", "/legal/privacy", "What data D.scribe keeps and why."],
];

export function llmsTxt(): string {
  const out: string[] = [];
  out.push("# D.scribe", "", `> ${DEFINITION}`, "", WHAT_IT_DOES, "", FOUNDING_LINE, "");
  out.push("## Who it is for", "", ...WHO_USES.map((w) => `- ${w}`), "");
  out.push("## Pricing (USD)", "", ...pricingLines(), "", `Full details: ${url("/pricing")}`, "");
  out.push("## Key pages", "");
  for (const [name, path, note] of KEY_PAGES) {
    out.push(`- [${name}](${url(path)}): ${note}`);
    if (path === "/vs") {
      for (const p of VS_PAGES) out.push(`  - [D.scribe vs ${p.competitor}](${url(`/vs/${p.slug}`)}): ${p.verdict}`);
    }
  }
  out.push("", "## Contact", "", `Support: ${SUPPORT_EMAIL}`, "");
  out.push("## Optional", "", `- [Full text for AI assistants](${url("/llms-full.txt")}): the about page, pricing, FAQ and comparisons in one file.`, "");
  return out.join("\n");
}

export function llmsFullTxt(): string {
  const out: string[] = [];
  out.push("# D.scribe: full reference", "", `> ${DEFINITION}`, "");
  out.push(`Canonical site: ${url("/")}. Short index: ${url("/llms.txt")}.`, "");
  out.push("## What D.scribe does", "", WHAT_IT_DOES, "", FOUNDING_LINE, "");
  out.push("## What makes D.scribe different", "");
  for (const d of DIFFERENTIATORS) {
    out.push(`### ${d.title}`, "", d.body, "");
    if (d.source) out.push(`Source: ${d.source.label}, ${d.source.url}`, "");
  }
  out.push("## Who uses D.scribe", "", ...WHO_USES.map((w) => `- ${w}`), "");
  out.push("## How D.scribe works", "");
  for (const h of HOW_IT_WORKS) out.push(`### ${h.title}`, "", h.body, "");
  out.push("## Pricing (USD)", "", ...pricingLines(), "", `Plan summary: ${D_SCRIBE_PRICING}`, "", `Source: ${url("/pricing")}`, "");
  out.push("## Key facts", "", ...KEY_FACTS.map(([k, v]) => `- ${k}: ${v}`), "");
  out.push("## Frequently asked questions", "");
  for (const f of FAQ_ITEMS) out.push(`### ${f.q}`, "", f.a, "");
  out.push("## Comparisons", "", SOURCED_NOTE, "");
  for (const p of VS_PAGES) {
    out.push(`### D.scribe vs ${p.competitor}`, "", `Page: ${url(`/vs/${p.slug}`)}`, "", p.verdict, "", p.intro, "");
    for (const r of p.rows) out.push(`- ${r.label}: D.scribe: ${r.ds} ${p.competitor}: ${r.them}`);
    out.push("", `Where ${p.competitor} is stronger: ${p.stronger}`, "", `Pick ${p.competitor} if: ${p.pickThem}`, "", `Pick D.scribe if: ${p.pickUs}`, "");
    for (const f of p.faqs) out.push(`- Q: ${f.q} A: ${f.a}`);
    out.push("");
  }
  out.push("## Contact", "", `Support: ${SUPPORT_EMAIL}`, "");
  return out.join("\n");
}
