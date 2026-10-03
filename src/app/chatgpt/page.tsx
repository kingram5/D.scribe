import type { Metadata } from "next";
import Link from "next/link";

/**
 * /chatgpt: what the D.scribe ChatGPT app does, its limits, and how data is
 * handled. It is the `resource_documentation` link in the OAuth discovery file.
 *
 * Deliberately noindex and out of the sitemap until the app is live in ChatGPT:
 * the copy must never imply availability or directory listing before approval.
 * At launch: drop `robots`, add to src/app/sitemap.ts (docs/chatgpt-app/launch-checklist.md).
 */
export const metadata: Metadata = {
  title: "D.scribe in ChatGPT",
  description: "Turn talks, sermons, workshops and drafts into a structured book plan in ChatGPT, then keep writing in D.scribe.",
  alternates: { canonical: "https://d-scribe.app/chatgpt" },
  robots: { index: false, follow: true },
};

const C = { bg: "#2C2419", ink: "#F9F7F2", body: "#C8C0B4", muted: "#A89F94", accent: "#C17A47", divider: "rgba(249,247,242,0.08)" } as const;
const SANS = "var(--font-inter), var(--font-manrope), sans-serif";
const SERIF = "var(--font-playfair), var(--font-lora), serif";
const H2: React.CSSProperties = { fontFamily: SERIF, fontStyle: "italic", fontWeight: 400, fontSize: "clamp(22px, 3vw, 28px)", color: C.ink, margin: "40px 0 14px" };
const P: React.CSSProperties = { fontFamily: SANS, fontSize: 16, lineHeight: 1.8, color: C.body, margin: "0 0 14px" };
const LI: React.CSSProperties = { ...P, margin: "0 0 8px" };

export default function ChatgptPage() {
  return (
    <main style={{ background: C.bg, minHeight: "100vh" }}>
      <article style={{ maxWidth: 720, margin: "0 auto", padding: "96px 16px 80px" }}>
        <p style={{ fontFamily: SANS, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: C.accent, margin: 0 }}>
          D.scribe for ChatGPT
        </p>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: "clamp(32px, 5vw, 44px)", color: C.ink, lineHeight: 1.15, margin: "12px 0 20px" }}>
          From a talk or a chat to a book plan you can keep building.
        </h1>
        <p style={P}>
          If you have been shaping a book in ChatGPT, or you have a keynote, sermon series or workshop you want to turn into one, the D.scribe app
          organizes it into a book plan: a working title, who it is for, the promise to the reader, chapters, and what is still missing. Save it and
          the project opens in D.scribe, where your recordings become a full manuscript.
        </p>

        <h2 style={H2}>Three ways in</h2>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={LI}>
            <strong style={{ color: C.ink }}>You have material.</strong> Paste a transcript or notes. Each chapter shows which part of your material it
            comes from, and quotes are checked against what you shared.
          </li>
          <li style={LI}>
            <strong style={{ color: C.ink }}>You have an idea.</strong> You get a provisional structure, clearly marked as not quoted from you, plus a
            list of the talks, stories and examples to gather next.
          </li>
          <li style={LI}>
            <strong style={{ color: C.ink }}>You already have an outline or draft.</strong> It is imported word for word. Suggestions are a separate step
            you can ask for, never a silent rewrite.
          </li>
        </ul>

        <h2 style={H2}>What it will not do</h2>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={LI}>Invent stories, quotes, credentials or results you never gave it.</li>
          <li style={LI}>Change or delete an existing D.scribe project. Saving always creates a new one.</li>
          <li style={LI}>See your other ChatGPT conversations or memory. It only receives what you share with it.</li>
          <li style={LI}>Turn audio or video into text inside ChatGPT. Upload recordings in D.scribe for that.</li>
        </ul>

        <h2 style={H2}>Accounts and Ink</h2>
        <p style={P}>
          You can preview a plan before you have an account. Saving, listing your projects, and having D.scribe&apos;s own model build the plan need a
          connected D.scribe account. Only that last option uses Ink from your balance, and the app tells you before it runs if your balance is too
          low. Writing the manuscript happens in D.scribe on your current plan; see <Link href="/pricing" style={{ color: C.accent }}>pricing</Link>.
        </p>

        <h2 style={H2}>Your data</h2>
        <p style={P}>
          Plan previews and the material they cite are deleted after 48 hours unless you save them. Saved plans live in your D.scribe account. You
          can disconnect ChatGPT anytime in Settings → Connected apps. Everything else about your account data is in the{" "}
          <Link href="/legal/privacy" style={{ color: C.accent }}>privacy policy</Link>.
          Questions: <a href="mailto:kyle@d-scribe.app" style={{ color: C.accent }}>kyle@d-scribe.app</a>.
        </p>

        <hr style={{ border: 0, borderTop: `1px solid ${C.divider}`, margin: "40px 0 20px" }} />
        <p style={{ ...P, color: C.muted, fontSize: 14 }}>
          Example requests: &ldquo;Turn this keynote transcript into a book outline.&rdquo; &ldquo;Organize my sermon series into a book.&rdquo;
          &ldquo;Save the book outline I developed here to D.scribe.&rdquo;
        </p>
      </article>
    </main>
  );
}
