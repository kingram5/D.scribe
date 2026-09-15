import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VS_PAGES, SOURCED_NOTE, getVsPage } from "@/lib/vs-pages";

/**
 * /vs/[slug] comparison pages (HeyCatch action plan, "Do this quarter").
 *
 * Three pages: Built&Written (closest ICP), Squibler (largest), Dictate (premium
 * service). Intent traffic from competitor-name searches converts far better than
 * cold homepage traffic, and no competitor in this set runs /vs pages.
 *
 * Server-rendered, same warm-editorial theme as /about and /pricing. Every
 * competitor claim is sourced from the HeyCatch competitor research and carries
 * your own unflattering row on purpose: rigged comparisons do not convert.
 */

export function generateStaticParams() {
  return VS_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getVsPage(slug);
  if (!page) return { title: "Compare" };
  const title = `D.scribe vs ${page.competitor}`;
  const description = `${page.verdict} An honest side-by-side of D.scribe and ${page.competitor} on price, input, and output.`;
  const url = `https://d-scribe.app/vs/${page.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | D.scribe`,
      description,
      url,
      siteName: "D.scribe",
      type: "article",
    },
  };
}

const COLORS = {
  bg: "#2C2419",
  ink: "#F9F7F2",
  body: "#C8C0B4",
  muted: "#A89F94",
  faint: "#7A7358",
  accent: "#C17A47",
  divider: "rgba(249,247,242,0.08)",
  card: "rgba(249,247,242,0.03)",
} as const;

const SANS = "var(--font-inter), var(--font-manrope), sans-serif";
const SERIF = "var(--font-playfair), var(--font-lora), serif";

export default async function VsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getVsPage(slug);
  if (!page) notFound();

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "D.scribe", item: "https://d-scribe.app" },
      { "@type": "ListItem", position: 2, name: "Compare", item: "https://d-scribe.app/vs" },
      {
        "@type": "ListItem",
        position: 3,
        name: `D.scribe vs ${page.competitor}`,
        item: `https://d-scribe.app/vs/${page.slug}`,
      },
    ],
  };

  return (
    <main
      style={{
        background: COLORS.bg,
        color: COLORS.body,
        minHeight: "100vh",
        fontFamily: SANS,
        padding: "0 24px",
      }}
    >
      <style>{`
        .vs-wrap { max-width: 860px; margin: 0 auto; padding: 72px 0 96px; }
        .vs-h1 { font-family: ${SERIF}; font-size: 44px; line-height: 1.12; color: ${COLORS.ink}; margin: 0 0 20px; font-weight: 500; }
        .vs-verdict { font-family: ${SERIF}; font-style: italic; font-size: 22px; line-height: 1.5; color: ${COLORS.accent}; margin: 0 0 40px; }
        .vs-body { font-size: 16px; line-height: 1.75; color: ${COLORS.body}; margin: 0 0 20px; }
        .vs-h2 { font-family: ${SERIF}; font-size: 28px; color: ${COLORS.ink}; margin: 56px 0 20px; font-weight: 500; }
        .vs-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border-top: 1px solid ${COLORS.divider}; padding: 20px 0; }
        .vs-label { grid-column: 1 / -1; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${COLORS.accent}; margin-bottom: 12px; }
        .vs-cell { font-size: 15px; line-height: 1.65; }
        .vs-cell.ds { color: ${COLORS.ink}; padding-right: 20px; }
        .vs-cell.them { color: ${COLORS.muted}; }
        .vs-who { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: ${COLORS.faint}; display: block; margin-bottom: 6px; }
        .vs-card { background: ${COLORS.card}; border: 1px solid ${COLORS.divider}; border-radius: 10px; padding: 22px 24px; margin-bottom: 16px; }
        .vs-cta { display: inline-block; background: ${COLORS.accent}; color: ${COLORS.bg}; font-weight: 600; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-size: 15px; }
        .vs-faq dt { font-family: ${SERIF}; font-size: 19px; color: ${COLORS.ink}; margin: 26px 0 8px; }
        .vs-faq dd { margin: 0; font-size: 15px; line-height: 1.7; color: ${COLORS.body}; }
        .vs-note { font-size: 13px; line-height: 1.65; color: ${COLORS.faint}; border-top: 1px solid ${COLORS.divider}; margin-top: 56px; padding-top: 20px; }
        @media (max-width: 700px) {
          .vs-h1 { font-size: 32px; }
          .vs-row { grid-template-columns: 1fr; gap: 14px; }
          .vs-cell.ds { padding-right: 0; }
        }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      <div className="vs-wrap">
        <Link
          href="/"
          style={{ fontSize: 13, color: COLORS.muted, textDecoration: "none", letterSpacing: "0.04em" }}
        >
          &larr; D.scribe
        </Link>

        <h1 className="vs-h1" style={{ marginTop: 28 }}>
          D.scribe vs {page.competitor}
        </h1>

        <p className="vs-verdict">{page.verdict}</p>

        <p className="vs-body">{page.intro}</p>

        <p className="vs-body" style={{ color: COLORS.muted, fontSize: 14 }}>
          Their own line: &ldquo;{page.theirClaim}&rdquo;
        </p>

        <h2 className="vs-h2">Side by side</h2>

        <div>
          {page.rows.map((row) => (
            <div className="vs-row" key={row.label}>
              <span className="vs-label">{row.label}</span>
              <div className="vs-cell ds">
                <span className="vs-who">D.scribe</span>
                {row.ds}
              </div>
              <div className="vs-cell them">
                <span className="vs-who">{page.competitor}</span>
                {row.them}
              </div>
            </div>
          ))}
        </div>

        <h2 className="vs-h2">Where {page.competitor} is better</h2>
        <div className="vs-card">
          <p className="vs-body" style={{ margin: 0, color: COLORS.ink }}>
            {page.stronger}
          </p>
        </div>

        <h2 className="vs-h2">Which one is right for you</h2>
        <div className="vs-card">
          <span className="vs-who">Pick {page.competitor} if</span>
          <p className="vs-body" style={{ margin: "0 0 22px" }}>
            {page.pickThem}
          </p>
          <span className="vs-who">Pick D.scribe if</span>
          <p className="vs-body" style={{ margin: 0, color: COLORS.ink }}>
            {page.pickUs}
          </p>
        </div>

        <h2 className="vs-h2">Questions people ask</h2>
        <dl className="vs-faq" style={{ margin: 0 }}>
          {page.faqs.map((f) => (
            <div key={f.q}>
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>

        <div style={{ marginTop: 56, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/login" className="vs-cta">
            Start with 10 Ink free
          </Link>
          <Link href="/pricing" style={{ color: COLORS.muted, fontSize: 14, textDecoration: "none" }}>
            See D.scribe pricing
          </Link>
        </div>

        <p className="vs-note">{SOURCED_NOTE}</p>

        <nav
          aria-label="Other comparisons"
          style={{ display: "flex", gap: "6px 18px", flexWrap: "wrap", marginTop: 32, fontSize: 13.5 }}
        >
          {VS_PAGES.filter((p) => p.slug !== page.slug).map((p) => (
            <Link key={p.slug} href={`/vs/${p.slug}`} style={{ color: COLORS.accent, textDecoration: "none" }}>
              D.scribe vs {p.competitor}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}