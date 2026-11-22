# Switch day: one plan at $99/month

Owner's ruling (Kyle, 2026-11-19): replace the three public plans ($25 / $50 / $100) with one plan at $99/month that includes 1,500 Ink a month. Existing subscribers keep their plan and price. Refill packs do not change. No new features.

The code is merged with the switch **off**. Nothing changes for anyone until the steps below are done, in this order.

## How it works (one paragraph)

`NEXT_PUBLIC_PLAN_99=true` changes only what is **offered**: the pricing page, the upgrade modal, the FAQ, /about, /vs, llms.txt, the structured data, and which Stripe price checkout uses. The $99 plan is billed on the existing `premium` tier, which already grants 1,500 Ink in code and in the database, so **there is no migration**. What a subscriber is entitled to comes from the tier stored on their account and from the Stripe price on their subscription, never from the flag. That is why existing subscribers are untouched and why rollback is safe.

| Setting | Where | Effect |
| --- | --- | --- |
| `STRIPE_PRICE_PLAN_99` | Vercel, Production | The Stripe price id of the $99/month price. Server only. Safe to set early: on its own it only teaches the webhook that this price means Premium. |
| `NEXT_PUBLIC_PLAN_99` | Vercel, Production | `true` shows the single plan and sells `STRIPE_PRICE_PLAN_99`. Read at build time, so it needs a redeploy. |

Fail-closed: with the flag on and `STRIPE_PRICE_PLAN_99` missing, or set to the id of one of the old plan prices or a refill price, checkout and plan switches answer 503 "Checkout is not available right now" and log an error. They never sell the $100 Premium price under a $99 label.

## Before switch day (read-only checks)

1. `NEXT_PUBLIC_PLANS_V2` is **not** set in Production, and migration `030_publisher_ready_plans.sql` has **not** been applied. Plan 99 uses the v1 allotments (Starter 300, Pro 660, Premium 1,500). If 030 were applied, the database would report 7,500 for Premium. Do not apply 030 while plan 99 is live.
2. The pricing copy says one Publisher-Ready book costs about 1,200 Ink. That is the v2 Ink meter (`INK_METER_V2=true`). Confirm Production runs that meter; on the old meter a book costs about 200 Ink and the "one book a month" line would undersell the plan.
3. In Stripe (live mode), open Coupons and find `dscribe-creator-50-first-month`. Note which products it applies to. It must include the Premium product (see step 1 below for why).
4. In Stripe, Settings > Billing > Customer portal: check whether "Customers can switch plans" is on. If it is, customers can move between whatever prices are listed there, outside the site. Either turn plan switching off in the portal or make sure the list is what you want. This repo cannot see that setting.

## Switch-day steps

1. **Stripe, live mode: create the price.** Product catalog > the existing **Premium** product (the one that holds today's $100 price, `STRIPE_PRICE_PREMIUM`) > Add another price > $99.00 USD, Recurring, Monthly. Copy the new `price_...` id.
   - It must sit on the **Premium product**, not a new product. Creator codes are one Stripe coupon limited to the plan products, and a coupon's product list cannot be edited after it is created. A $99 price on a new product would not get the creator 50% off.
   - Do **not** archive or edit the $25 / $50 / $100 prices. Existing subscribers renew on them, and rollback needs them.
2. **Vercel, Production environment only:** add `STRIPE_PRICE_PLAN_99` = the new price id, and `NEXT_PUBLIC_PLAN_99` = `true`.
3. **Redeploy Production** (a new build; the public flag is baked in at build time).
4. **Verify**, signed out, on https://www.d-scribe.app:
   - `/pricing`: one card, "Premium", "$99/mo", "1,500 Ink · 1 Publisher-Ready book". No Starter or Pro card. Page title "Pricing: One Plan, $99 a Month".
   - View source on `/pricing`, find `application/ld+json`: exactly two offers, "Free trial" at 0.00 and "Premium plan" at 99.00.
   - `/llms.txt` and `/llms-full.txt`: "One plan, Premium: $99/month with 1,500 Ink a month". No $25 or $50.
   - `/about` key facts and the homepage FAQ ("How does Ink work?"): one plan, 1,500 Ink.
   - **Checkout, no charge:** sign in with a free test account, press Get Started on `/pricing`, and stop at the Stripe card page. It must read **$99.00 per month**. Close the tab without paying. If it reads $100.00, the env var holds the wrong price id: fix it and redeploy.
   - **Existing subscriber:** sign in as an account on Starter, Pro or old Premium. The app meters and Settings look the same as yesterday. `/pricing` shows the one card plus a note that their plan and price stay as they are. Settings > Manage billing opens Stripe showing their real price.
5. **Webhook check.** Stripe > Developers > Webhooks > the production endpoint: recent deliveries are 200. After the first real $99 sale, confirm in Supabase that the buyer's `ink_balances` row has `tier = premium` and `ink_balance = 1500`, and that the `checkout.session.completed` and `invoice.payment_succeeded` deliveries are 200. (The mapping is covered by tests; this is the live confirmation.)

## What existing subscribers get

- **Starter ($25) and Pro ($50):** keep their plan, price and monthly Ink (300 / 660) on every renewal. Cancel, undo-cancel and the Stripe billing portal work as before. The only plan they can move to is the $99 plan; choosing it switches their subscription in place and bills the prorated difference immediately. Moving between Starter and Pro is no longer possible.
- **Premium at $100:** not migrated and not re-priced. They stay at $100 until they cancel. The site never moves them to $99, including when they undo a cancellation. If you want to give them the $99 price, that is a manual change in Stripe (swap the subscription's price), and your decision.
- **Creator partners with comp Premium:** unchanged.

## Rollback

1. Vercel, Production: set `NEXT_PUBLIC_PLAN_99` to empty (or delete it). **Leave `STRIPE_PRICE_PLAN_99` in place.**
2. Redeploy Production.

The three plans are back for new sign-ups. Anyone who bought at $99 keeps working and keeps renewing at $99 with 1,500 Ink, because the price id still maps to Premium. Removing `STRIPE_PRICE_PLAN_99` while $99 subscriptions exist would stop the webhook from recognizing them on plan changes, so do not remove it. Do not archive the $99 price in Stripe either, for the same subscribers.

## By hand, owner only

- Creating the $99 price in live Stripe (step 1).
- Setting the two Vercel Production variables and redeploying (steps 2 and 3).
- The customer-portal plan-switching setting (pre-check 4).
- Any decision to move $100 Premium subscribers to $99.
- Telling existing subscribers, if you want to. Nothing in the product announces the change to them beyond the note on `/pricing`.

## Known edges

- **Open tabs across the switch or a rollback.** A pricing page loaded before the deploy still shows the old cards. Pressing an old Starter or Pro button after the switch gets "That plan is no longer offered" and no charge. After a rollback, a stale single-plan tab's button buys Premium at today's $100 price while the stale page said $99. Low odds, and Stripe's card page always shows the real amount before payment.
- **Old `/upgrade/starter` and `/upgrade/pro` links** go back to `/pricing` while the flag is on.
- **The plan is named "Premium"** because it is billed on the premium tier, and the app meters, partner terms and comp accounts all use that name. Renaming it is one constant (`PLAN_99.name` in `src/lib/tiers.ts`) plus the tier label.
- **Refund policy page** still lists "Starter, Pro, Premium", which stays accurate while subscribers on those plans exist.
- **iPhone app:** no API route changed shape. In-app purchase of the $99 plan is separate work.
