# Privacy and data flow

## What D.scribe receives from ChatGPT

Only what arrives in a tool call: pasted transcript or notes, an outline or draft, idea answers, plan drafts, and (since 2026-11-11, `add_to_project`) material the assistant writes out at the user's request, which can include things ChatGPT remembers about the user. D.scribe never reads other conversations, ChatGPT memory or profile data directly; with `add_to_project`, ChatGPT itself may put remembered details into the text it sends, when the user asks it to ("save everything you remember about my life..."). `/agents.md` tells the assistant to send only what was asked and to show a large save to the user first.

## Where it goes

| Data | Stored where | How long |
| --- | --- | --- |
| Source text (segmented) + plan preview | `book_plan_previews` (service-role only) | 48 hours, then deleted by `purge_expired_book_plans` |
| Claim token | Only its SHA-256 hash is stored | With the preview |
| Saved plan | A new D.scribe project (`projects`, `chapters`, `chapter_contents` for draft imports) | Until the user deletes the project or account |
| Material saved with `add_to_project` (verbatim text, title, assistant name, kind) | A stub `audio_uploads` row + a `transcripts` row in the chosen project, like a recording's transcript | Until the user deletes the project or account (cascades). Not used to learn the user's voice. Not sent to any model until the user runs a step that reads it (Analyze, chapter writing, a T.H.E.O. interview briefing), same as an uploaded recording |
| Idempotency records (ids + payload hash, no text) | `plan_idempotency` | 7 days |
| Outline snapshots before a regenerate | `outline_snapshots` | Last 10 per project; deleted with the project |
| Model calls (only with "use D.scribe's model") | Anthropic API, same as the website | Per D.scribe's existing AI disclosure |

## Not stored or logged

Access tokens, claim tokens, emails, titles and any manuscript or source text never enter analytics or routine logs (`events.ts` drops every property not on a content-free allow-list; tested). Rate limiting for anonymous calls uses ChatGPT's anonymized `openai/subject` id (not stored anywhere but the rate-limit counter key) plus a global ceiling.

## Disconnect and deletion

- **Disconnect** (Settings → Connected apps, or revoking in ChatGPT): Supabase revokes the grant, deletes that client's sessions and refresh tokens; the next ChatGPT call is rejected. Projects already saved stay.
- **Project deletion:** cascades to chapters, contents and snapshots; a preview pointing at it keeps only a null project link until it expires.
- **Account deletion:** `book_plan_previews.owner_user_id` and `plan_idempotency.user_id` cascade from `auth.users`.

## Privacy policy wording for assistant saves: PENDING KYLE APPROVAL

Draft only. The live `/legal/privacy` page was **not** edited. Needed before `CHATGPT_APP_WRITES` goes on in production, because the current published section (approved 2026-10-03) covers ChatGPT plan previews and saves but not material an assistant pushes into an existing book, or memories.

Proposed replacement for the policy's ChatGPT app paragraph:

> **AI assistants (ChatGPT app).** You can connect an AI assistant to D.scribe. Today that is ChatGPT. When you ask it to, the assistant can send D.scribe text to add to one of your books: an exchange from your chat, notes, or things the assistant remembers about you and your life. We receive only the text the assistant sends in that request, plus the title and type it gives it. We do not read your other conversations, your assistant's memory or your profile. Text you save this way is stored in the book you chose, like the transcript of a recording, until you delete it or the book or your account. We use it to help you build that book. We do not use it to learn your writing voice, because the wording is the assistant's, not yours. It is sent to our AI providers only when you run a step that uses it in D.scribe, such as Analyze, writing a chapter or a T.H.E.O. interview, under the same terms as your recordings. Unsaved plan previews and the material they cite are deleted after 48 hours. You can disconnect an assistant anytime in Settings → Connected apps; what it already saved stays in your account until you delete it.

Open questions for Kyle:
- Name ChatGPT only (as drafted), or say "AI assistants such as ChatGPT"? Drafted narrow because only ChatGPT can connect today.
- Should memories get extra wording? The draft treats them like any other material the user chose to save.

## Privacy policy changes needed before launch

The published policy must add: the ChatGPT app as a source of data, the 48-hour preview retention, and the connected-apps disconnect control. Done 2026-10-03 (owner approved; on this branch, live with the merge). The 2026-11-11 assistant-saves wording above is still pending.
