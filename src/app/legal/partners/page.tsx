import type { Metadata } from "next";
import { LegalShell, H2, P, UL, Strong } from "../LegalShell";
import {
  COMMISSION_HOLD_DAYS,
  PARTNER_BONUS_INK,
  PARTNER_COMMISSION_MONTHS,
  PARTNER_COMMISSION_RATE,
  PARTNER_DISCOUNT_PERCENT,
  PAYOUT_MINIMUM_CENTS,
} from "@/lib/partner-rules";

export const metadata: Metadata = {
  title: "Partner Program Terms",
  description: "D.scribe Partner Program Terms: what creators earn, what their audience gets, how payouts work, and the rules for promoting D.scribe.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "September 25, 2026";
const pct = Math.round(PARTNER_COMMISSION_RATE * 100);

export default function PartnerTermsPage() {
  return (
    <LegalShell
      title="Partner Program Terms"
      subtitle="What partners earn, what their audience gets, and how we work together."
      lastUpdated={LAST_UPDATED}
      currentPath="/legal/partners"
    >
      <P>
        These terms apply to anyone accepted into the D.scribe Partner Program (&quot;you&quot;). They sit alongside the
        D.scribe Terms of Service. By using your partner link or code, you agree to them.
      </P>

      <H2>1. Joining</H2>
      <P>
        The program is by invitation or approved application. We may approve or decline any application, and we may pause
        or end a partnership at any time, for any reason, with notice by email.
      </P>

      <H2>2. What your audience gets</H2>
      <UL
        items={[
          `A new D.scribe account created through your link or code receives ${PARTNER_BONUS_INK} free Ink, once per person. Deleting and recreating an account, or opening several, does not grant it again.`,
          `First-time subscribers who use your link or code get ${PARTNER_DISCOUNT_PERCENT}% off their first month of the Starter, Pro or Premium plan. Ink and voice refills are full price.`,
          "Offers can't be combined with other discounts, and your code has a use limit and an expiry date that we may adjust.",
        ]}
      />

      <H2>3. What you earn</H2>
      <UL
        items={[
          `${pct}% of what each customer you refer pays D.scribe for their first ${PARTNER_COMMISSION_MONTHS} months, starting with their first payment. That includes plan payments and refills, after discounts, and excludes taxes.`,
          "A customer counts as yours if they signed up through your link or code, or entered your code at checkout, and nobody referred them first.",
          `Each commission is held for ${COMMISSION_HOLD_DAYS} days so refunds and chargebacks can clear. A refunded or disputed payment earns nothing.`,
          "You can't earn on your own account or on accounts you control.",
        ]}
      />

      <H2>4. Payouts</H2>
      <P>
        Payouts are sent through Stripe. To be paid, you set up a Stripe payout account from your partner page; Stripe
        collects your bank and tax details directly, and D.scribe never sees them. We release payouts monthly once you
        have at least <Strong>${PAYOUT_MINIMUM_CENTS / 100}</Strong> cleared. Amounts under that roll over to the next month.
      </P>
      <P>
        You are responsible for your own taxes. If you are in the US and we pay you $600 or more in a year, we will issue
        you a 1099 as the law requires.
      </P>

      <H2>5. Your free Premium account</H2>
      <P>
        Active partners get D.scribe Premium at no charge while the partnership is active. It ends if the partnership is
        paused or ends. It has no cash value.
      </P>

      <H2>6. How to promote D.scribe</H2>
      <UL
        items={[
          "Disclose the partnership every time you share your link or code (for example #ad, #partner, or \"I earn a commission\"). This is required by the US Federal Trade Commission.",
          "Be accurate. Don't promise results D.scribe doesn't deliver, and don't describe it as something it isn't.",
          "Don't post your code on coupon or deal sites, and don't bid on \"D.scribe\" or similar terms in paid search ads.",
          "Don't send spam, buy traffic that fakes signups, or use your link in any way that breaks platform rules or the law.",
        ]}
      />
      <P>
        If we find fraud, self-referrals or a breach of these rules, we may void the commissions involved and end the
        partnership.
      </P>

      <H2>7. Changes</H2>
      <P>
        We may change these terms, the offer, or the commission rate going forward. We&apos;ll email you before a change that
        affects what you earn, and commissions already earned are paid under the terms in place when they were earned.
      </P>

      <H2>8. Contact</H2>
      <P>Questions about the program: kyle@d-scribe.app.</P>
    </LegalShell>
  );
}
