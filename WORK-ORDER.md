# Work Order — D.scribe HeyCatch quick wins (BMO)

**From:** Answer (Hermes) · **To:** BMO (Claude Code)
**Date:** 2026-09-10
**Requested by:** Kyle ("go on BMo")
**Source:** HeyCatch action plan for D.scribe, run 2026-09-10. Raw scrape: `C:\Answer\heycatch\action-plan-2026-09-10.txt`

## Repo and branch

- Worktree: `C:\Answer\worktrees\dscribe-heycatch`
- Branch: `marketing/heycatch-quick-wins` (off `origin/master` @ `9c4f02d`)
- Live landing file: `src/app/landing-v2/page.tsx` (the h1 lives at ~line 1087)
- Site title already reads "Turn Your Voice Into a Published Book with AI"; the visual H1 does not match it.

⚠️ Kyle's working copy at `OneDrive\Desktop\manuscript` is on `master` and **321 commits behind**. Do not work in it. Use the worktree above.

## Scope — 9 low-effort quick wins, in this order

Work one item at a time. Commit per item with the item number in the message.

**1. Hero h1 + subhead.** Current h1: "There's an Author Inside You" — names no category and no buyer.
Replace with h1: `Turn Your Voice Into a Published Book.`
Subhead: `D.scribe transcribes your sermons, coaching calls, and keynotes, then writes your manuscript chapter by chapter in your voice. You talk. It writes.`
Keep the existing Playfair italic + copper accent treatment so the hero still looks like the brand.

**2. Founder block.** New `/about` page (currently redirects to `/login`) plus a compact founder block in the homepage footer.
⚠️ **Needs Kyle:** headshot file, and 2–3 sentences of "why I built this" in his own voice. Build the page and layout now with an obvious placeholder; do not write the story for him.

**3. Usage badge in the hero stats bar.** Replace one stat slot (or add a fourth) with a real number — books generated, authors writing, or hours transcribed. Pull from Supabase, do not hard-code. If the number is small, frame honestly: "Join the first 100 authors using D.scribe."

**4. Label the spoken brainstorming feature.** The 'Human + AI' section shows an unlabeled brainstorm mockup. Add a label and one-liner: `Talk it out with your ghostwriter. Spoken AI brainstorming sessions on Pro and Premium.`

**5. Pricing page anchors.** Above the tier cards add: `Traditional ghostwriters charge $30,000-$80,000 and take 12-24 months. D.scribe starts at $25/month and delivers your first draft in under an hour.` Add Stripe and Apple Pay trust marks below each tier CTA.

**6. Secondary hero CTA.** Both hero CTAs currently point at `/login`. Replace the redundant `HERE` button with `See how it works` (anchor-scroll to the 7-step section) as a lower-contrast outline/text link.

**7. Metadata and schema.** Add `og:image` and `twitter:image` to homepage and pricing page. Add Product JSON-LD to the pricing page (name, description, 3 offers with prices). Change `aria-hidden="true"` on the dashboard mockup to a descriptive `aria-label`.

**8. FAQ additions.** Add 3 items: (a) "Will the manuscript sound like me or like AI?" — voice profile, "Nothing invented. Nothing hallucinated." (b) "Can it maintain consistency across a full 40,000-word book?" — content analysis + AI coherence pass. (c) "How much editing will I need to do?" — manuscript editor, every sentence editable.
⚠️ Copy must clear the D.scribe voice rules: no "unleash/revolutionize/supercharge/game-changer", no exclamation marks, address speakers/pastors/coaches, never label output "AI-generated."

**9. Hero video weight.** Change `preload="auto"` to `preload="metadata"` and confirm the poster image is compressed.

## Rules

- Do not deploy. Do not merge. Do not push to `master`.
- Do not touch billing, auth, the Ink ledger, or anything behind `PUBLIC_SIGNUP`.
- No copy in Kyle's voice that he has not written (item 2, and item 8's answers should stay factual).
- Run `npm run build` (or `npx tsc --noEmit`) after the batch and report the real result.

## Required report back

One file: `C:\Answer\projects\heycatch-quick-wins-2026-09-10.md` with, per item: status (done / blocked / skipped), file(s) touched, commit hash, and the exact verification command with its real output. State plainly which items are blocked on Kyle. No item is "done" without a build or type check that passed.


---

## Sandbox note

Write the report to `./HEYCATCH-REPORT.md` inside this worktree root. The work order and report both live inside the worktree because this session is sandboxed here.
