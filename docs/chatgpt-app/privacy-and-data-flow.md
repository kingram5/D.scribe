# Privacy and data flow

## What D.scribe receives from ChatGPT

Only what the user shares with a tool call: pasted transcript or notes, an outline or draft, idea answers, and plan drafts. The app cannot see other conversations, ChatGPT memory, or profile data, and does not ask for them.

## Where it goes

| Data | Stored where | How long |
| --- | --- | --- |
| Source text (segmented) + plan preview | `book_plan_previews` (service-role only) | 48 hours, then deleted by `purge_expired_book_plans` |
| Claim token | Only its SHA-256 hash is stored | With the preview |
| Saved plan | A new D.scribe project (`projects`, `chapters`, `chapter_contents` for draft imports) | Until the user deletes the project or account |
| Idempotency records (ids + payload hash, no text) | `plan_idempotency` | 7 days |
| Outline snapshots before a regenerate | `outline_snapshots` | Last 10 per project; deleted with the project |
| Model calls (only with "use D.scribe's model") | Anthropic API, same as the website | Per D.scribe's existing AI disclosure |

## Not stored or logged

Access tokens, claim tokens, emails, titles and any manuscript or source text never enter analytics or routine logs (`events.ts` drops every property not on a content-free allow-list; tested). Rate limiting for anonymous calls uses a hashed IP.

## Disconnect and deletion

- **Disconnect** (Settings → Connected apps, or revoking in ChatGPT): Supabase revokes the grant, deletes that client's sessions and refresh tokens; the next ChatGPT call is rejected. Projects already saved stay.
- **Project deletion:** cascades to chapters, contents and snapshots; a preview pointing at it keeps only a null project link until it expires.
- **Account deletion:** `book_plan_previews.owner_user_id` and `plan_idempotency.user_id` cascade from `auth.users`.

## Privacy policy changes needed before launch

The published policy must add: the ChatGPT app as a source of data, the 48-hour preview retention, and the connected-apps disconnect control. Draft wording is in `submission.md`; it needs the owner's approval before publishing.
