import type { Metadata } from "next";
import { LegalShell, H2, P, UL, Strong, Clause, Note } from "../LegalShell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "D.scribe Terms of Service — the agreement governing your use of the D.scribe voice-to-manuscript service.",
  robots: { index: false, follow: true },
};

const LAST_UPDATED = "June 1, 2026";

export default function TermsOfServicePage() {
  return (
    <LegalShell
      title="Terms of Service"
      subtitle="The agreement that governs your access to and use of D.scribe."
      lastUpdated={LAST_UPDATED}
      currentPath="/legal/terms"
    >
      <P>
        <Strong>DRAFT — pending launch-readiness verification.</Strong>
      </P>

      <H2>1. Agreement to terms</H2>
      <P>
        By creating an account, accessing the service, or using any D.scribe feature, you agree to these Terms of
        Service and our Privacy Policy.
      </P>
      <P>If you do not agree, do not use the service.</P>

      <H2>2. Who may use the service</H2>
      <P>You must be at least 18 years old to use D.scribe.</P>
      <P>You represent that:</P>
      <UL
        items={[
          "you have the legal capacity to enter into this agreement;",
          "the information you provide is accurate and current;",
          "you are responsible for activity on your account.",
        ]}
      />

      <H2>3. The service</H2>
      <P>
        D.scribe helps users upload audio, generate transcripts, analyze content, draft outlines, and generate
        manuscript content with the assistance of AI systems.
      </P>
      <P>
        AI output may be incomplete, inaccurate, offensive, or unsuitable for publication. You are responsible for
        reviewing, editing, and approving all output before use or publication.
      </P>

      <H2>4. Account responsibilities</H2>
      <P>You agree not to:</P>
      <UL
        items={[
          "share your login credentials;",
          "bypass access controls or usage limits;",
          "interfere with rate limits, billing, or metering;",
          "upload malware, unlawful content, or content you do not have rights to use;",
          "reverse engineer or scrape the service except where prohibited by law from limiting that right.",
        ]}
      />

      <H2>5. Content and ownership</H2>
      <P>
        You retain ownership of the content you submit to D.scribe, subject to any third-party rights you already
        granted elsewhere.
      </P>
      <P>
        Subject to your compliance with these Terms and payment of applicable fees, you own the output you download or
        export from the service, to the extent permitted by law.
      </P>
      <P>
        You grant D.scribe a limited license to host, process, transmit, display, and transform your content solely to
        operate, maintain, secure, and improve the service.
      </P>

      <H2>6. Acceptable use</H2>
      <P>You may not use the service to:</P>
      <UL
        items={[
          "violate law or regulation;",
          "infringe copyright, trademark, privacy, publicity, or other rights;",
          "generate or distribute harmful, fraudulent, deceptive, or abusive content;",
          "upload or process content that includes sensitive personal information unless you have a lawful basis to do so;",
          "evade billing, usage controls, consent gates, or account restrictions;",
          "probe, test, or disrupt the service or any connected system.",
        ]}
      />

      <H2>7. Fees, billing, and credits</H2>
      <P>Some features require payment, subscription, Ink, or other usage-based charges.</P>
      <UL
        items={[
          "Prices, credits, and plan limits may change.",
          "You authorize us and our payment processor to charge your chosen payment method for applicable fees.",
          "You are responsible for taxes unless we state otherwise.",
          "Usage metering may be approximate and may be reconciled after generation completes.",
          "If a payment fails, a subscription is canceled, refunded, disputed, or reversed, we may suspend or reduce access to paid features.",
        ]}
      />
      <P>
        Refunds, cancellations, and renewal details are described in our Refund and Cancellation Policy and in the
        checkout flow.
      </P>

      <H2>8. Third-party services</H2>
      <P>
        D.scribe uses third-party services such as cloud hosting, storage, authentication, AI providers, analytics, and
        payment processing.
      </P>
      <P>
        Those providers operate under their own terms and privacy practices. We are not responsible for their
        independent acts or outages.
      </P>

      <H2>9. Suspension and termination</H2>
      <P>We may suspend or terminate access if we believe:</P>
      <UL
        items={[
          "you violated these Terms;",
          "your use poses a security, legal, or operational risk;",
          "your account is overdue, disputed, or abusive;",
          "required service dependencies are unavailable.",
        ]}
      />
      <P>
        You may stop using the service at any time. Termination does not relieve you of amounts already owed.
      </P>

      <H2>10. Disclaimers</H2>
      <Clause>THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot;</Clause>
      <Clause>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
      </Clause>
      <P>
        We do not promise uninterrupted service, error-free output, or that AI-generated content is accurate, complete,
        or suitable for any particular purpose.
      </P>

      <H2>11. Limitation of liability</H2>
      <Clause>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, D.scribe AND ITS AFFILIATES WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL,
        SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES.
      </Clause>
      <P>Our total liability for claims relating to the service will not exceed the greater of:</P>
      <UL
        items={[
          "the amount you paid to us in the 12 months before the claim; or",
          "if no payment was made, USD $100.",
        ]}
      />
      <P>Some jurisdictions do not allow some limitations, so some of the above may not apply to you.</P>

      <H2>12. Indemnity</H2>
      <P>
        You agree to defend, indemnify, and hold harmless D.scribe from claims arising out of your content, your use of
        the service, or your violation of these Terms or applicable law.
      </P>

      <H2>13. Governing law and disputes</H2>
      <P>
        These Terms are governed by the laws of the State of Texas, without regard to conflict-of-law rules.
      </P>
      <P>
        Any dispute will be brought in state or federal courts located in Texas, unless applicable law requires
        otherwise.
      </P>

      <H2>14. Changes to the service or terms</H2>
      <P>
        We may update the service or these Terms from time to time. If we make material changes, we will post the
        updated version and update the effective date.
      </P>

      <H2>15. Contact</H2>
      <P>
        Questions about these Terms can be sent to the support contact shown in the product or on the website.
      </P>

      <Note>
        Draft note: finalize company legal name, support email, effective date, and refund/cancellation linkage before
        publication.
      </Note>
    </LegalShell>
  );
}
