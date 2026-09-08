import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { LegalShell, H2, P, UL, Strong, Clause } from "../LegalShell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "D.scribe Terms of Service — the agreement governing your use of the D.scribe voice-to-manuscript service.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "September 9, 2026";

const link: CSSProperties = { color: "inherit", textDecoration: "underline" };

export default function TermsOfServicePage() {
  return (
    <LegalShell
      title="Terms of Service"
      subtitle="The agreement that governs your access to and use of D.scribe."
      lastUpdated={LAST_UPDATED}
      currentPath="/legal/terms"
    >
      <H2>1. Agreement to terms</H2>
      <P>
        These Terms of Service are a contract between you and D.scribe, a service operated by Kyle Ingram, an
        individual proprietor based in Dallas, Texas, United States (&quot;D.scribe&quot;, &quot;we&quot;,
        &quot;us&quot;). By creating an account or using any D.scribe feature you agree to these Terms, our{" "}
        <Link href="/legal/privacy" style={link}>Privacy Policy</Link>, our{" "}
        <Link href="/legal/acceptable-use" style={link}>Acceptable Use Policy</Link>, and our{" "}
        <Link href="/legal/refunds" style={link}>Refund and Cancellation Policy</Link>.
      </P>
      <P>If you do not agree, do not use the service.</P>

      <H2>2. Who may use the service</H2>
      <P>You must be at least 18 years old to use D.scribe.</P>
      <P>You represent that:</P>
      <UL
        items={[
          "you have the legal capacity to enter into this agreement;",
          "the information you provide is accurate and current;",
          "you are responsible for all activity on your account and for keeping your sign-in email secure.",
        ]}
      />

      <H2>3. The service, and what AI means here</H2>
      <P>
        D.scribe turns your recordings and brainstorm sessions into transcripts, analyses, outlines, and manuscript
        drafts using artificial intelligence, then gives you an editor to shape the result. Some features, including
        T.H.E.O, speak back to you with a synthetic voice.
      </P>
      <P>
        AI output may be incomplete, inaccurate, offensive, or unsuitable for publication, and may resemble
        material the underlying models were trained on. <Strong>You are the author.</Strong> You are responsible for
        reviewing, editing, fact-checking, and approving every word before you use or publish it, and for any
        disclosures your publisher, platform, or jurisdiction requires about AI-assisted writing.
      </P>
      <P>
        We may add, change, or retire features, and we may label some features as beta. Beta features can be
        removed or changed without notice.
      </P>

      <H2>4. Account responsibilities</H2>
      <P>You agree not to:</P>
      <UL
        items={[
          "share your account or let others sign in as you;",
          "bypass access controls, usage limits, Ink metering, or consent gates;",
          "upload malware, unlawful content, or content you do not have the rights to use;",
          "reverse engineer, scrape, or bulk-download the service or its output, except where the law prohibits us from limiting that right;",
          "use the service to build a competing product by systematically extracting its output.",
        ]}
      />

      <H2>5. Your content and your ownership</H2>
      <P>
        You keep ownership of everything you upload and record. Subject to these Terms and payment of any fees you
        owe, you own the manuscripts, outlines, and other output you download or export from the service, to the
        extent the law allows ownership of AI-assisted work. We claim no rights in your book.
      </P>
      <P>
        You grant D.scribe a limited, non-exclusive license to host, store, process, transmit, display, and transform
        your content solely to operate, secure, and improve the service for you. This license ends when you delete
        the content, except for copies that persist briefly in backups. We do not use your content to train AI
        models.
      </P>
      <P>
        If you choose to list a project on the public Discover page, you grant us permission to display the title,
        description, audience, excerpt, and author name you set until you unlist it.
      </P>

      <H2>6. Acceptable use</H2>
      <P>
        Our <Link href="/legal/acceptable-use" style={link}>Acceptable Use Policy</Link> is part of these Terms. In
        short, you may not use D.scribe to:
      </P>
      <UL
        items={[
          "break the law or the rights of others, including copyright, trademark, privacy, and publicity rights;",
          "record or transcribe people without the consent the law requires;",
          "create or spread harmful, fraudulent, deceptive, or abusive content;",
          "process sensitive personal information about others without a lawful basis;",
          "probe, overload, or disrupt the service or any connected system.",
        ]}
      />

      <H2>7. Fees, Ink, and billing</H2>
      <P>
        Paid plans bill monthly in advance through Stripe. Usage inside the product is metered in Ink and voice
        minutes. Top-up packs are one-time purchases.
      </P>
      <UL
        items={[
          "You authorize us and Stripe to charge your chosen payment method for the plan and top-ups you select, plus any applicable taxes.",
          "We show an Ink estimate before every major action; final metering is settled when the action completes and may differ slightly from the estimate.",
          "Prices, Ink allotments, and plan limits may change. We will give you at least 14 days notice by email before a price change applies to your renewal.",
          "If a payment fails or is disputed, reversed, or refunded, we may suspend or reduce paid features until it is resolved.",
          "Free starter Ink has no cash value and is granted once per person.",
        ]}
      />
      <P>
        Cancellation and refunds are governed by the{" "}
        <Link href="/legal/refunds" style={link}>Refund and Cancellation Policy</Link>.
      </P>

      <H2>8. Third-party services</H2>
      <P>
        D.scribe relies on third-party providers for hosting, storage, sign-in, transcription, AI generation, voice
        synthesis, web research, payments, and error monitoring. They are listed in the Privacy Policy. Those
        providers operate under their own terms, and we are not responsible for their independent acts or
        outages. Google Drive export is optional and governed by Google&apos;s terms as well as ours.
      </P>

      <H2>9. Copyright complaints</H2>
      <P>
        We respond to notices of claimed copyright infringement as described in our{" "}
        <Link href="/legal/dmca" style={link}>DMCA Policy</Link>. Repeat infringers lose their accounts.
      </P>

      <H2>10. Suspension and termination</H2>
      <P>We may suspend or terminate access if we reasonably believe that:</P>
      <UL
        items={[
          "you violated these Terms or the Acceptable Use Policy;",
          "your use creates a security, legal, or operational risk;",
          "your account is overdue, disputed, or abusive;",
          "a provider we depend on becomes unavailable.",
        ]}
      />
      <P>
        You may stop using the service or delete your account at any time from Settings. Termination does not
        relieve you of amounts already owed. Export your work before you delete your account; deletion is
        immediate and permanent.
      </P>

      <H2>11. Disclaimers</H2>
      <Clause>THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot;</Clause>
      <Clause>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
      </Clause>
      <P>
        We do not promise uninterrupted service, error-free output, or that AI-generated content is accurate,
        original, complete, or suitable for any particular purpose. Nothing on D.scribe is legal, financial, medical,
        or professional advice.
      </P>

      <H2>12. Limitation of liability</H2>
      <Clause>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, D.scribe AND ITS OPERATOR WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL,
        SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA, OR GOODWILL.
      </Clause>
      <P>Our total liability for all claims relating to the service will not exceed the greater of:</P>
      <UL
        items={[
          "the amount you paid us in the 12 months before the claim; or",
          "USD $100.",
        ]}
      />
      <P>Some jurisdictions do not allow some of these limitations, so some may not apply to you.</P>

      <H2>13. Indemnity</H2>
      <P>
        You agree to defend, indemnify, and hold harmless D.scribe and its operator from claims, damages, and expenses
        arising out of your content, your use of the service, or your violation of these Terms or applicable law.
      </P>

      <H2>14. Governing law and disputes</H2>
      <P>
        These Terms are governed by the laws of the State of Texas, without regard to conflict-of-law rules. Any
        dispute will be brought in the state or federal courts located in Dallas County, Texas, unless applicable law
        gives you the right to sue elsewhere. Before filing, you agree to email us and give us 30 days to resolve the
        issue informally.
      </P>

      <H2>15. Changes to the service or these Terms</H2>
      <P>
        We may update these Terms from time to time. For material changes we will post the updated version with a
        new date and tell you by email or in the product before they take effect. Continued use after that date
        means you accept the new Terms.
      </P>

      <H2>16. Contact</H2>
      <P>
        Kyle Ingram, D.scribe, Dallas, Texas, United States. <Strong>kyle@d-scribe.app</Strong>.
      </P>
    </LegalShell>
  );
}
