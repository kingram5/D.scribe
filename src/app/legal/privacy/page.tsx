import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, Strong, Note } from "../LegalShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "D.scribe Privacy Policy — what information we collect, how we use it, who we share it with, and the choices you have.",
  robots: { index: false, follow: true },
};

const LAST_UPDATED = "June 1, 2026";

export default function PrivacyPolicyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      subtitle="What we collect, how we use it, who we share it with, and your choices."
      lastUpdated={LAST_UPDATED}
      currentPath="/legal/privacy"
    >
      <P>
        <Strong>DRAFT — pending launch-readiness verification.</Strong>
      </P>

      <H2>1. Overview</H2>
      <P>
        This Privacy Policy explains what information D.scribe collects, how we use it, who we share it with, and the
        choices you have.
      </P>
      <P>
        D.scribe is a writing and content-generation service that processes user-uploaded audio, transcripts,
        manuscript drafts, and related project data.
      </P>

      <H2>2. Information we collect</H2>
      <P>We may collect the following categories of information:</P>

      <H3>Information you provide</H3>
      <UL
        items={[
          "account details such as email address and profile information;",
          "content you upload, including audio files, transcripts, notes, chapter outlines, and generated drafts;",
          "billing and subscription details;",
          "support messages and feedback;",
          "consent choices and preferences.",
        ]}
      />

      <H3>Information collected automatically</H3>
      <UL
        items={[
          "device and browser information;",
          "log and error data;",
          "usage metrics, session data, and feature activity;",
          "IP address and approximate location derived from network data;",
          "cookie and tracking information, where enabled and permitted by your consent choices.",
        ]}
      />

      <H3>Information from third parties</H3>
      <UL
        items={[
          "authentication providers;",
          "payment processors;",
          "storage providers;",
          "analytics / observability tools;",
          "AI and transcription providers;",
          "advertising platforms, if you consent to marketing pixels.",
        ]}
      />

      <H2>3. How we use information</H2>
      <P>We use information to:</P>
      <UL
        items={[
          "provide, maintain, and improve the service;",
          "authenticate users and secure accounts;",
          "generate transcripts, analyses, outlines, and manuscripts;",
          "meter usage and bill for paid features;",
          "detect abuse, fraud, and security issues;",
          "communicate with you about your account and service changes;",
          "comply with legal obligations.",
        ]}
      />

      <H2>4. AI and content processing</H2>
      <P>
        Your uploads and prompts may be processed by AI and transcription providers to generate outputs and power
        features.
      </P>
      <P>
        We use these providers only to operate the service and do not authorize them to use your content for unrelated
        purposes beyond their own service terms and settings.
      </P>
      <P>
        <Strong>Important:</Strong> final retention behavior depends on the provider and our configuration. Do not
        publish any statement about audio retention or training limitations unless it matches the live Deepgram and
        provider settings in production.
      </P>

      <H2>5. Subprocessors</H2>
      <P>We may share data with the following categories of subprocessors to provide the service:</P>
      <UL
        items={[
          <><Strong>Anthropic</Strong> — AI text generation and related processing</>,
          <><Strong>Deepgram</Strong> — transcription and speech processing</>,
          <><Strong>Cloudflare R2</Strong> — file storage and delivery</>,
          <><Strong>Supabase</Strong> — database, authentication, and backend services</>,
          <><Strong>Stripe</Strong> — billing and subscription processing</>,
          <><Strong>Sentry</Strong> — error monitoring and debugging</>,
          <><Strong>TikTok</Strong> — marketing attribution, only if consent is granted</>,
          <><Strong>LinkedIn</Strong> — marketing attribution, only if consent is granted</>,
        ]}
      />
      <P>This list should be kept current with production usage.</P>

      <H2>6. Cookies and similar technologies</H2>
      <P>We use cookies and similar technologies for:</P>
      <UL
        items={[
          "authentication and session management;",
          "security and load balancing;",
          "preferences and consent;",
          "analytics and attribution where permitted.",
        ]}
      />
      <P>
        Marketing pixels and non-essential analytics should only load after the user has given consent where required
        by law.
      </P>

      <H2>7. Sharing of information</H2>
      <P>We may share information with:</P>
      <UL
        items={[
          "service providers and subprocessors;",
          "payment processors;",
          "legal authorities when required by law;",
          "successors in the event of a corporate transaction;",
          "others with your direction or consent.",
        ]}
      />
      <P>We do not sell your manuscript content.</P>

      <H2>8. Data retention</H2>
      <P>
        We retain information for as long as needed to provide the service, comply with legal obligations, resolve
        disputes, enforce agreements, and maintain security.
      </P>
      <P>
        Retention periods vary by data type. Some operational logs, backups, and vendor systems may retain data for
        limited periods even after deletion from the main product database.
      </P>

      <H2>9. Data deletion and access</H2>
      <P>
        You may request access, correction, or deletion of your personal information by contacting support.
      </P>
      <P>
        Because the product uses multiple storage systems, deletion requests may require coordinated removal from the
        application database, storage buckets, and third-party systems where applicable.
      </P>

      <H2>10. International transfers</H2>
      <P>
        Your information may be processed in countries other than your own. Where required, we rely on appropriate
        transfer mechanisms or vendor contractual protections.
      </P>

      <H2>11. Your privacy rights</H2>
      <P>Depending on where you live, you may have rights to:</P>
      <UL
        items={[
          "access your personal information;",
          "correct inaccurate information;",
          "delete personal information;",
          "object to or restrict certain processing;",
          "withdraw consent where processing is based on consent;",
          "appeal certain privacy decisions.",
        ]}
      />

      <H2>12. Children&apos;s privacy</H2>
      <P>
        The service is intended for adults age 18 and older. We do not knowingly collect personal information from
        children.
      </P>

      <H2>13. Security</H2>
      <P>
        We use administrative, technical, and organizational measures designed to protect information, but no system is
        perfectly secure.
      </P>

      <H2>14. Changes to this policy</H2>
      <P>
        We may update this Privacy Policy from time to time. Material changes will be posted with a new effective date.
      </P>

      <H2>15. Contact</H2>
      <P>
        Questions or requests about privacy can be sent to the support contact shown in the product or on the website.
      </P>

      <Note>
        Draft note: finalize deletion workflow wording, retention periods, and provider-specific retention/training
        claims before publication.
      </Note>
    </LegalShell>
  );
}
