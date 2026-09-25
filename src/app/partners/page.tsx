import type { Metadata } from "next";
import Link from "next/link";
import { PartnerApplyForm } from "@/components/partners/PartnerApplyForm";
import {
  PARTNER_BONUS_INK,
  PARTNER_COMMISSION_MONTHS,
  PARTNER_COMMISSION_RATE,
  PARTNER_DISCOUNT_PERCENT,
  PAYOUT_MINIMUM_CENTS,
} from "@/lib/partner-rules";

export const metadata: Metadata = {
  title: "Partner Program — Share D.scribe, Earn 30%",
  description: `Speakers, pastors, coaches and podcasters: give your audience ${PARTNER_BONUS_INK} free Ink and ${PARTNER_DISCOUNT_PERCENT}% off their first month of D.scribe, and earn ${Math.round(PARTNER_COMMISSION_RATE * 100)}% of their plan payments for a year.`,
  alternates: { canonical: "https://d-scribe.app/partners" },
};

const serif = "var(--font-playfair), var(--font-lora), serif";
const sans = "var(--font-inter), var(--font-manrope), sans-serif";

const POINTS: { title: string; body: string }[] = [
  { title: "Your people get a head start", body: `Anyone who signs up through your link or code gets ${PARTNER_BONUS_INK} free Ink to start writing, plus ${PARTNER_DISCOUNT_PERCENT}% off their first month on any plan.` },
  { title: `You earn ${Math.round(PARTNER_COMMISSION_RATE * 100)}%`, body: `Of their plan payments for their first ${PARTNER_COMMISSION_MONTHS} months. Counted once their 30-day refund window has passed.` },
  { title: "Premium, on the house", body: "Write your own book with D.scribe while you're a partner. Your best post is the one where you actually use it." },
  { title: "Paid through Stripe", body: `Monthly, once you've earned $${PAYOUT_MINIMUM_CENTS / 100}. Your bank and tax details go to Stripe, never to us.` },
];

export default function PartnersPage() {
  return (
    <main style={{ minHeight: "100dvh", backgroundColor: "#2C2419", color: "#F9F7F2", padding: "72px 20px 96px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/" style={{ fontFamily: serif, fontStyle: "italic", fontSize: 22, color: "#F9F7F2", textDecoration: "none" }}>
          <span style={{ color: "#C17A47" }}>D.</span> scribe
        </Link>
        <p style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#C17A47", marginTop: 48, marginBottom: 12 }}>
          Partner program
        </p>
        <h1 style={{ fontFamily: serif, fontWeight: 400, fontStyle: "italic", fontSize: "clamp(34px, 5vw, 54px)", lineHeight: 1.1, margin: 0 }}>
          Your audience has books in them. Help them get written.
        </h1>
        <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.6, color: "#C8C0B4", marginTop: 20, maxWidth: 620 }}>
          D.scribe turns the way people already talk into a written book. If you speak, preach, coach or host a show,
          the people who follow you are full of stories they&apos;ve never put on paper. Share D.scribe with them and
          get paid for every writer you bring.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 44 }}>
          {POINTS.map((p) => (
            <div key={p.title} style={{ border: "1px solid rgba(249,247,242,0.1)", borderRadius: 14, padding: "20px 22px", background: "rgba(249,247,242,0.03)" }}>
              <p style={{ fontFamily: serif, fontSize: 21, margin: 0 }}>{p.title}</p>
              <p style={{ fontFamily: sans, fontSize: 15, lineHeight: 1.55, color: "#C8C0B4", marginTop: 8, marginBottom: 0 }}>{p.body}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 64, maxWidth: 560 }}>
          <h2 style={{ fontFamily: serif, fontWeight: 400, fontStyle: "italic", fontSize: 32, margin: "0 0 8px" }}>Apply</h2>
          <p style={{ fontFamily: sans, fontSize: 15, color: "#C8C0B4", marginTop: 0, marginBottom: 24 }}>
            We&apos;re starting small and reading every application ourselves.
          </p>
          <PartnerApplyForm />
        </div>
      </div>
    </main>
  );
}
