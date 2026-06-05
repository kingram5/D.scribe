import type { Metadata } from "next";
import { LegalShell, H2, P, UL, Strong } from "../LegalShell";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description:
    "D.scribe Acceptable Use Policy — prohibited uses, content rules, and how we enforce them.",
  robots: { index: false, follow: true },
};

const LAST_UPDATED = "June 1, 2026";

export default function AcceptableUsePolicyPage() {
  return (
    <LegalShell
      title="Acceptable Use Policy"
      subtitle="What you may and may not do with D.scribe."
      lastUpdated={LAST_UPDATED}
      currentPath="/legal/acceptable-use"
    >
      <P>
        <Strong>DRAFT — companion policy for public launch.</Strong>
      </P>

      <H2>Prohibited use</H2>
      <P>You may not use D.scribe to:</P>
      <UL
        items={[
          "break the law or help others do so;",
          "infringe copyright or other intellectual property rights;",
          "upload malware or harmful code;",
          "abuse rate limits, billing, or consent controls;",
          "harvest personal data or use the service for spam, phishing, or fraud;",
          "upload content you do not have the right to process;",
          "attempt to bypass account restrictions or access another user's data;",
          "interfere with the security or availability of the service.",
        ]}
      />

      <H2>Content rules</H2>
      <P>
        You are responsible for ensuring that anything you upload, generate, or publish using the service is lawful and
        appropriate.
      </P>
      <P>You may not use the service to generate or distribute content that is:</P>
      <UL
        items={[
          "illegal;",
          "exploitative;",
          "defamatory;",
          "deceptive or impersonating others;",
          "sexually exploitative or abusive;",
          "discriminatory or harassing;",
          "otherwise harmful.",
        ]}
      />

      <H2>Enforcement</H2>
      <P>
        We may remove content, suspend accounts, or terminate access if we believe a user has violated this policy or
        created risk to the service, its users, or third parties.
      </P>
    </LegalShell>
  );
}
