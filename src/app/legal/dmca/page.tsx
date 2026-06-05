import type { Metadata } from "next";
import { LegalShell, H2, P, UL, Strong } from "../LegalShell";

export const metadata: Metadata = {
  title: "DMCA Policy",
  description:
    "D.scribe DMCA Policy — how to submit a notice of claimed copyright infringement and our repeat-infringer policy.",
  robots: { index: false, follow: true },
};

const LAST_UPDATED = "June 1, 2026";

export default function DmcaPolicyPage() {
  return (
    <LegalShell
      title="DMCA Policy"
      subtitle="How to report claimed copyright infringement on D.scribe."
      lastUpdated={LAST_UPDATED}
      currentPath="/legal/dmca"
    >
      <P>
        <Strong>DRAFT — for public launch if public content is available.</Strong>
      </P>

      <H2>Designated DMCA agent</H2>
      <P>
        D.scribe will designate a DMCA agent and maintain required registration information with the U.S. Copyright
        Office before relying on safe-harbor protections for public content features.
      </P>

      <H2>Notice of claimed infringement</H2>
      <P>If you believe content on the service infringes your copyright, send a notice that includes:</P>
      <UL
        items={[
          "your contact information;",
          "identification of the copyrighted work claimed to be infringed;",
          "identification of the material claimed to be infringing and where it is located;",
          "a statement that you have a good-faith belief the use is not authorized;",
          "a statement, under penalty of perjury, that the information is accurate and you are authorized to act;",
          "your physical or electronic signature.",
        ]}
      />

      <H2>Repeat infringer policy</H2>
      <P>D.scribe may disable or terminate accounts of repeat infringers in appropriate circumstances.</P>

      <H2>Counter-notice</H2>
      <P>
        If you believe material was removed or disabled by mistake, you may send a counter-notice with the information
        required by applicable law.
      </P>
    </LegalShell>
  );
}
