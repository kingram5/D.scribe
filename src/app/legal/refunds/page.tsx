import type { Metadata } from "next";
import { LegalShell, H2, P, UL, Strong } from "../LegalShell";

export const metadata: Metadata = {
  title: "Refund and Cancellation Policy",
  description:
    "D.scribe Refund and Cancellation Policy — how subscriptions renew, how to cancel, and when charges are refunded.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "September 9, 2026";

export default function RefundPolicyPage() {
  return (
    <LegalShell
      title="Refund and Cancellation Policy"
      subtitle="How plans renew, how to cancel, and when we refund a charge."
      lastUpdated={LAST_UPDATED}
      currentPath="/legal/refunds"
    >
      <H2>1. Plans and renewal</H2>
      <P>
        D.scribe subscriptions (Starter, Pro, Premium) bill monthly in advance through Stripe. Each renewal
        refreshes the plan&apos;s monthly Ink and voice allowance. Unused monthly Ink does not roll over unless the
        plan says otherwise at checkout.
      </P>
      <P>
        À la carte top-up packs (extra Ink or voice minutes) are one-time purchases that are added to your balance
        as soon as the payment settles.
      </P>

      <H2>2. Cancelling</H2>
      <P>
        You can cancel at any time from <Strong>Settings → Manage billing</Strong>, which opens the Stripe customer
        portal. Cancelling stops future renewals. Your plan stays active, with its remaining Ink, until the end of the
        period you already paid for. No further charges are made after that.
      </P>
      <P>Deleting your account from Settings also cancels any active subscription.</P>

      <H2>3. Refunds</H2>
      <UL
        items={[
          "Partial months are not refunded when you cancel; access simply runs to the end of the paid period.",
          "Top-up packs are not refundable once the Ink or voice minutes have been added to your account.",
          "Duplicate or mistaken charges are refunded in full. Contact us with the charge date and amount.",
          "If something on our side stopped you from using what you paid for, tell us within 7 days of the charge and we will make it right with a refund or credit.",
        ]}
      />
      <P>
        Refunds go back to the original payment method and typically post within 5 to 10 business days, depending on
        your bank.
      </P>

      <H2>4. Free Ink and trials</H2>
      <P>
        New accounts receive a small amount of free Ink. Free Ink has no cash value, cannot be refunded or transferred,
        and is granted once per person. Deleting and recreating an account does not grant it again.
      </P>

      <H2>5. Price changes</H2>
      <P>
        If we change the price of your plan, we will tell you by email at least 14 days before the new price applies
        to your next renewal. You can cancel before then and pay nothing further.
      </P>

      <H2>6. Contact</H2>
      <P>
        Billing questions and refund requests: <Strong>kyle@d-scribe.app</Strong>. Include the email on your account
        and the date of the charge.
      </P>
    </LegalShell>
  );
}
