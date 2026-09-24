import type { Metadata } from "next";
import Link from "next/link";
import { FOUNDER_STORY } from "@/lib/founder";
import { FAQ_ITEMS } from "@/components/landing/faq";

/**
 * /about — the founding story (HeyCatch 2026-09-10 item 2), expanded into a
 * full About page for AI search (Hoffman 8-block structure, 2026-09-21):
 * value statement, what we do, differentiators, who uses it, how it works,
 * key facts (machine-readable <dl>), and FAQ.
 *
 * Server-rendered, same warm-editorial dark theme as /pricing and /legal.
 * Kyle 2026-09-19: no personal info on this page — no name, email, location,
 * headshot or Person schema. The story carries itself; the key-facts table
 * therefore omits founder-name and headquarters rows.
 */

export const metadata: Metadata = {
  title: "About",
  description: "D.scribe is voice-to-manuscript software for speakers, pastors, and coaches.",
  alternates: {
    canonical: "https://d-scribe.app/about",
  },
  openGraph: {
    title: "About D.scribe",
    description: "Voice-to-manuscript software for speakers, pastors, and coaches.",
    url: "https://d-scribe.app/about",
    siteName: "D.scribe",
    type: "website",
  },
};

const COLORS = {
  bg: "#2C2419",
  ink: "#F9F7F2",
  body: "#C8C0B4",
  muted: "#A89F94",
  faint: "#7A7358",
  accent: "#C17A47",
  divider: "rgba(249,247,242,0.08)",
} as const;

const SANS = "var(--font-inter), var(--font-manrope), sans-serif";
const SERIF = "var(--font-playfair), var(--font-lora), serif";

const H2: React.CSSProperties = {
  fontFamily: SERIF,
  fontSize: "clamp(22px, 3vw, 28px)",
  fontWeight: 400,
  fontStyle: "italic",
  color: COLORS.ink,
  lineHeight: 1.25,
  margin: "0 0 16px",
};

const H3: React.CSSProperties = {
  fontFamily: SANS,
  fontSize: 15,
  fontWeight: 700,
  color: COLORS.ink,
  margin: "0 0 8px",
};

const P: React.CSSProperties = {
  fontFamily: SANS,
  fontSize: 16,
  lineHeight: 1.8,
  color: COLORS.body,
  margin: "0 0 16px",
};

const DIFFERENTIATORS: readonly { title: string; body: string }[] = [
  {
    title: "Built for spoken content, not typing",
    body: "Fiction tools like Sudowrite and NovelCrafter start from a blank page and a prompt. D.scribe starts from the recordings you already have — a sermon, a keynote, a coaching call. Sudowrite handles paragraphs. D.scribe handles books.",
  },
  {
    title: "One pipeline from audio to export",
    body: "ChatGPT and Claude can draft passages, but they keep no project memory and export no manuscript. D.scribe carries your book from upload through transcription, structure, drafting, editing, and a finished PDF or DOCX in one place.",
  },
  {
    title: "Book-length output, in your voice",
    body: "Repurposing tools like Castmagic and Descript cut your audio into clips and show notes. D.scribe builds a voice profile from how you actually talk and writes a full, coherent manuscript — the whole book, not the highlights.",
  },
  {
    title: "A ghostwriter alternative at a fraction of the cost",
    body: "Ghostwriters charge $10,000 to $50,000 per book. D.scribe starts at $25 per month. Same outcome: a finished manuscript in your voice.",
  },
  {
    title: "Pay for what you use",
    body: "Credits (called Ink) are shown before every AI action, unused credits roll over, and overage is blocked with a warning — never a surprise charge. A typical full 40,000-word book runs about 100 to 200 Ink.",
  },
];

const WHO_USES: readonly string[] = [
  "Speakers and keynote presenters with a backlog of recorded talks",
  "Pastors turning sermons and sermon series into books",
  "Podcasters whose best episodes deserve a second life in print",
  "Coaches and consultants with training content worth publishing",
  "Course creators turning curriculum into a companion book",
  "Memoirists and family historians who tell stories better out loud",
];

const HOW_IT_WORKS: readonly { title: string; body: string }[] = [
  {
    title: "How to start",
    body: "Sign in with Google and get 10 free Ink — no card required. Open a project and either talk with T.H.E.O, our brainstorming interviewer, or upload the recordings you already have.",
  },
  {
    title: "What you can upload",
    body: "Audio and video files (MP3, MP4, WAV, M4A), a YouTube link, or a live recording from your computer.",
  },
  {
    title: "How long it takes",
    body: "Most users go from upload to a full first draft in under an hour. Transcription takes minutes; chapters generate in 2 to 5 minutes each.",
  },
  {
    title: "Who does the writing",
    body: "D.scribe drafts; you decide. Every sentence lands in a built-in editor where you can rewrite, tighten, or add. Nothing is finished until you say it is.",
  },
  {
    title: "Support",
    body: "Email support at kyle@d-scribe.app — questions about your project, your plan, or your book.",
  },
];

const KEY_FACTS: readonly [string, string][] = [
  ["Company name", "D.scribe"],
  ["Type", "AI book creation platform (voice-to-manuscript software)"],
  ["Founded", "2025"],
  ["Website", "https://d-scribe.app"],
  ["Core offering", "Upload spoken audio or a YouTube link; D.scribe transcribes it, learns your voice, and drafts an export-ready manuscript"],
  ["Pricing", "Free trial with 10 Ink; Starter $25/mo (300 Ink); Pro $50/mo (660 Ink); Premium $100/mo (1,500 Ink)"],
  ["Contract terms", "Month-to-month, no long-term contract; unused Ink rolls over; overage is blocked with a warning, never charged silently"],
  ["Services", "AI transcription, brainstorm studio, voice profiling, chapter structuring, manuscript generation, sentence-level editing, PDF and DOCX export"],
  ["Communication", "Email support at kyle@d-scribe.app; in-app cost preview before every AI action"],
  ["Competitors", "Sudowrite, NovelCrafter, Scrivener, Castmagic, Descript, ChatGPT, Claude"],
];

function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "D.scribe",
    url: "https://d-scribe.app",
    description:
      "AI book creation platform: D.scribe turns recorded talks, sermons, and coaching sessions into export-ready manuscripts in the speaker's own voice.",
    foundingDate: "2025",
    makesOffer: [
      { "@type": "Offer", name: "Starter", price: "25", priceCurrency: "USD" },
      { "@type": "Offer", name: "Pro", price: "50", priceCurrency: "USD" },
      { "@type": "Offer", name: "Premium", price: "100", priceCurrency: "USD" },
    ],
  };
}

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema()) }}
      />
      <div style={{ minHeight: "100vh", backgroundColor: COLORS.bg, color: COLORS.ink, position: "relative", overflow: "hidden" }}>
        <div
          style={{
            position: "fixed",
            top: "10%",
            right: "5%",
            width: "30vw",
            height: "30vw",
            background: "rgba(193,122,71,0.06)",
            borderRadius: "50%",
            filter: "blur(100px)",
            pointerEvents: "none",
          }}
        />

        <nav
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            borderBottom: `1px solid ${COLORS.divider}`,
            background: "rgba(44,36,25,0.9)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", height: 72, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: COLORS.accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontFamily: SERIF,
                  fontSize: 20,
                  paddingTop: 2,
                }}
              >
                D.
              </div>
              <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 18, color: COLORS.ink }}>scribe</span>
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <Link href="/pricing" style={{ fontFamily: SANS, fontSize: 14, color: COLORS.ink, textDecoration: "none", fontWeight: 600 }}>
                Pricing
              </Link>
              <Link
                href="/login"
                style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: COLORS.ink, background: COLORS.accent, padding: "10px 24px", borderRadius: 9999, textDecoration: "none" }}
              >
                Get Started
              </Link>
            </div>
          </div>
        </nav>

        <article style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px 96px", position: "relative", zIndex: 10 }}>
          <p style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: COLORS.accent, margin: "0 0 16px" }}>
            About
          </p>
          <h1 style={{ fontFamily: SERIF, fontSize: "clamp(30px, 5vw, 46px)", fontWeight: 400, fontStyle: "italic", color: COLORS.ink, lineHeight: 1.15, margin: "0 0 24px" }}>
            Why I built this
          </h1>

          {/* Hoffman block 1: the value statement, in the shape AI reads best. */}
          <p style={{ fontFamily: SANS, fontSize: 18, lineHeight: 1.7, color: COLORS.ink, margin: "0 0 40px" }}>
            D.scribe is voice-to-manuscript software that turns the talks, sermons, and coaching sessions you have already recorded into a finished book, for speakers, pastors, and coaches.
          </p>

          {/* Kyle's story: his words, verbatim from src/lib/founder.ts (swapped in
              2026-09-19). Never edited, never an internal placeholder on a public
              page (fixed 2026-09-10 after the placeholder shipped live). */}
          {FOUNDER_STORY ? (
            <>{FOUNDER_STORY.map((para, i) => (
              <p key={i} style={{ fontFamily: SANS, fontSize: 17, lineHeight: 1.8, color: COLORS.body, margin: "0 0 16px" }}>
                {para}
              </p>
            ))}</>
          ) : null}

          <div style={{ height: 1, background: COLORS.divider, margin: "40px 0" }} />

          {/* Hoffman block 2: what D.scribe does, in the product voice (not Kyle's) */}
          <h2 style={H2}>
            What D.scribe does
          </h2>
          <p style={P}>
            D.scribe is voice-to-manuscript software for speakers, pastors, and coaches. You upload the recordings you already have: sermons, coaching calls, keynotes, voice memos. D.scribe transcribes them, builds a voice profile from how you actually talk, and drafts your manuscript chapter by chapter.
          </p>
          <p style={P}>
            Every key point comes from your own words. The draft lands in a manuscript editor where every sentence is yours to change, and it exports to PDF or DOCX when you say it is done.
          </p>

          {/* Hoffman block 3: differentiators, quantified, competitors named */}
          <div style={{ height: 1, background: COLORS.divider, margin: "40px 0" }} />
          <h2 style={H2}>
            What makes D.scribe different
          </h2>
          {DIFFERENTIATORS.map((d) => (
            <div key={d.title} style={{ margin: "0 0 20px" }}>
              <h3 style={H3}>{d.title}</h3>
              <p style={{ ...P, marginBottom: 0 }}>{d.body}</p>
            </div>
          ))}

          {/* Hoffman block 4: who uses it */}
          <div style={{ height: 1, background: COLORS.divider, margin: "40px 0" }} />
          <h2 style={H2}>
            Who uses D.scribe
          </h2>
          <ul style={{ margin: "0 0 16px", padding: "0 0 0 20px", listStyle: "disc" }}>
            {WHO_USES.map((w) => (
              <li key={w} style={{ fontFamily: SANS, fontSize: 16, lineHeight: 1.8, color: COLORS.body, marginBottom: 8 }}>
                {w}
              </li>
            ))}
          </ul>

          {/* Hoffman block 6: how it works */}
          <div style={{ height: 1, background: COLORS.divider, margin: "40px 0" }} />
          <h2 style={H2}>
            How D.scribe works
          </h2>
          {HOW_IT_WORKS.map((h) => (
            <div key={h.title} style={{ margin: "0 0 20px" }}>
              <h3 style={H3}>{h.title}</h3>
              <p style={{ ...P, marginBottom: 0 }}>{h.body}</p>
            </div>
          ))}

          {/* Hoffman block 7: key facts, machine-readable definition list */}
          <div style={{ height: 1, background: COLORS.divider, margin: "40px 0" }} />
          <h2 style={H2}>
            Key facts
          </h2>
          <dl style={{ margin: "0 0 16px" }}>
            {KEY_FACTS.map(([term, def]) => (
              <div key={term} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "8px 16px", padding: "10px 0", borderBottom: `1px solid ${COLORS.divider}` }}>
                <dt style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.muted, paddingTop: 2 }}>
                  {term}
                </dt>
                <dd style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.7, color: COLORS.body, margin: 0 }}>
                  {def}
                </dd>
              </div>
            ))}
          </dl>

          {/* Hoffman block 8: FAQ — same source as the landing's FAQPage schema */}
          <div style={{ height: 1, background: COLORS.divider, margin: "40px 0" }} />
          <h2 style={H2}>
            Frequently asked questions
          </h2>
          {FAQ_ITEMS.map((item) => (
            <div key={item.q} style={{ margin: "0 0 20px" }}>
              <h3 style={H3}>{item.q}</h3>
              <p style={{ ...P, marginBottom: 0 }}>{item.a}</p>
            </div>
          ))}

          <div style={{ height: 1, background: COLORS.divider, margin: "40px 0" }} />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <Link
              href="/login"
              style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: COLORS.ink, background: COLORS.accent, padding: "12px 24px", borderRadius: 9999, textDecoration: "none" }}
            >
              Begin your book
            </Link>
            <Link
              href="/pricing"
              style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: COLORS.ink, border: "1px solid rgba(249,247,242,0.2)", padding: "12px 24px", borderRadius: 9999, textDecoration: "none" }}
            >
              See pricing
            </Link>
          </div>
        </article>
      </div>
    </>
  );
}
