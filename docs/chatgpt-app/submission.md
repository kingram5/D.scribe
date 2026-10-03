# Directory submission package (draft, needs owner approval)

Status: NOT submitted. Nothing here claims approval or placement.

## Listing

- **Name:** D.scribe
- **Description:** Turn talks, sermons, workshops and existing drafts into a structured book plan, then develop the manuscript in D.scribe. Shows where each chapter comes from in your own material, flags what is still missing, and imports outlines you already wrote without rewording them.
  (No pricing or comparisons, per the guidelines.)
- **Example prompts:**
  - Turn this keynote transcript into a book outline.
  - Organize my sermon series into a book.
  - Save the book outline I developed here to D.scribe.
- **Support:** kyle@d-scribe.app · **Privacy:** https://www.d-scribe.app/legal/privacy · **Terms:** https://www.d-scribe.app/legal/terms

## Capabilities (accurate to the code)

- Build a plan from shared material with chapter-level source references; quotes are checked against the material.
- Provisional plan plus a collection plan from an idea alone, clearly labeled as not quoted.
- Word-for-word import of an outline or draft.
- Save as a new D.scribe project and open it; never edits or deletes existing projects.
- List projects and show outline progress.

## Authentication explanation for reviewers

Previews of plans the assistant drafts and imports work without an account. Saving, listing projects and D.scribe's own plan generation need the user to connect a D.scribe account (OAuth 2.1 + PKCE via Supabase Auth). The consent screen lists what the app can do; Settings → Connected apps disconnects.

## Paid features explanation

D.scribe's own plan generation (optional) uses the user's existing D.scribe Ink balance. The app never sells, upsells, or links to checkout. If Ink is insufficient it says so and links to the account settings page.

## Reviewer setup (owner to create)

- Demo account with sample data: a confirmed email on the beta allowlist (or `PUBLIC_SIGNUP` on), Ink balance ≥ 20, one sample project. Credentials go only into the submission form, never into the repo.

## Demo script (≈3 minutes)

1. "Turn this keynote transcript into a book outline" + paste a sample transcript → card shows chapters with source quotes and gaps.
2. "Make chapter 2 about rest instead" → refined card, no resend of the transcript.
3. Click Save to D.scribe → account link → consent → card shows "Continue in D.scribe" → opens the new project.
4. "Save the book outline I wrote here to D.scribe" with a pasted outline → imported word for word.
5. "What projects do I have in D.scribe?" → list.

Screenshots: capture from developer mode during step 5 of deployment (not possible before a live connection).

## Privacy policy additions (draft wording, owner approval required)

> **ChatGPT app.** If you use D.scribe inside ChatGPT, we receive only the text you choose to share with the app (for example a transcript, notes, or an outline). Unsaved plan previews and the material they cite are deleted after 48 hours. Plans you save become D.scribe projects in your account. You can disconnect ChatGPT anytime in Settings → Connected apps; projects you saved stay in your account.

## Beta (do not contact anyone without authorization)

- 10-20 testers: speakers, pastors, coaches, writers with a ChatGPT outline.
- Script: steps 1-5 above with their own material.
- Feedback form questions: Was the plan useful (1-5)? Did any chapter claim something you never said? Did linking work first try? Did the saved project match what you saw? Would you continue the book in D.scribe?
