# D.Scribe edge test — Meet T.H.E.O. lobby + Brainstorm studio, M3
**Run:** 2026-08-12
**Scope:** `MeetTheoPanel`, `TheoIntroVideo`, upload entry, `BrainstormChat`, brainstorm/TTS routes, studio CSS, session storage, PWA surface.
**Method:** source adversarial passes plus regression probes. The prior write-up was not available in this environment; `master` was verified at `240b136` before this run. Findings fixed by batches 1–4 were treated as closed and were not re-opened.

## Run log — 5/5 lenses
| Lens | Status | Result |
|---|---|---|
| 1. Small-screen typography/density | Complete | The lobby CTA/panel consumed too much of a phone viewport. A narrow-screen containment and type/CTA reduction is included. The studio itself still needs its separate mobile redesign. |
| 2. Offline & PWA behaviour | Complete | No manifest, service worker, offline shell, asset cache, or queued mutation path exists. The product is currently online-only. |
| 3. Notifications / interruption recovery | Complete | Background microphone/TTS was not explicitly stopped. Opening-stream and Finish failures left broken/no-op retry paths. Long unsent answers were not persisted. All are fixed. |
| 4. Content-length extremes | Complete | A 3,000-word draft could be lost on eviction; TTS requests could complete and play out of sentence order. Both are fixed. There is still no explicit server-side conversation-size budget. |
| 5. Returning-user journey | Complete | A stale max-wait write could recreate a finished session; blocked browser storage could prevent navigation after a successful Finish; SPA unmount could skip the final flush. All are fixed. Legacy array sessions remain readable. |

## Confirmed still open from prior backlog
The batch-1 and batch-3 commit messages confirm that a further external backlog exists in `projects/dscribe-edge-test-theo-2026-08-11.md`, but that file is unavailable here. Its entries, severity, and locations cannot be honestly enumerated. The four relevant shipped commits (`931102b`, `3e7f2e0`, `bbab85e`, `240b136`) cover the named greeting, studio error surface, Safari alpha, mobile Enter/IME, microphone-denial, auto-scroll, escape-hatch CSS-variable, and Resume-quote regressions; M3 did not re-litigate them.

## New in M3
| ID | Severity | Lens | Location | Finding / mobile memoir harm | Concrete fix |
|---|---|---|---|---|---|
| M3-01 | HIGH — fixed | 3, 4, 5 | `BrainstormChat.tsx: autosave effect`, `parseSavedSession` | Autosave only serialized sent messages. An interruption or tab eviction while a user was composing a long answer deleted every unsent word, which is the likely form of a memoir answer. | Save `{ messages, draft }`, flush it on hide/pagehide, restore the draft on Continue, and read old array-format sessions. |
| M3-02 | HIGH — fixed | 5 | `BrainstormChat.tsx: finishBrainstorm`, `maxWaitRef` | The two-second max-wait timer outlived Finish and could recreate the local session after it was removed. A returning user could resume already-summarized material and create duplicate source material. | Cancel the timer before removal and on unmount. |
| M3-03 | HIGH — fixed | 5 | `BrainstormChat.tsx: finishBrainstorm` | `localStorage.removeItem` was outside a guard. In a storage-blocked browser the server could create the transcript, then the client would throw instead of navigating away, inviting a second Finish. | Make cleanup best-effort; successful server completion always routes onward. |
| M3-04 | MED — deferred | 2 | `src/app/layout.tsx` and repository `public/` / client sources | There is no PWA implementation. Offline launch cannot load the studio, and an offline answer cannot be queued or recovered across devices. The full-screen studio presentation must not be mistaken for installability. | Kyle must choose whether this is deliberately online-only or needs an offline contract; then add a manifest, worker, cache policy, encrypted draft queue, replay/conflict UX, and explicit offline status. Probe remains `it.fails()`. |
| M3-05 | MED — fixed | 3, 4 | `BrainstormChat.tsx: speakSentence`, TTS request refs | Sentence TTS fetches were concurrent. Under a long/multi-sentence response, a faster later request could enqueue and play before an earlier sentence; a voice-first user hears a scrambled question. | Serialize text-to-speech requests, retain decoded-audio order, and invalidate outstanding work when playback stops/backgrounds. |
| M3-06 | MED — deferred | 4 | `BrainstormChat.tsx: sendMessage`, `/api/brainstorm/route.ts: POST`, `/api/brainstorm/summarize/route.ts: POST` | Neither client nor route applies a conversation/message size budget. A 3,000-word answer currently has no friendly boundary; much larger input can become a slow/failed request or an oversized final source without an actionable limit. | Kyle must set the acceptable answer/session limit and whether over-limit content is chunked, warned, or rejected. Then enforce the same budget client/server and expose remaining capacity. |
| M3-07 | LOW — fixed | 1 | `MeetTheoPanel.tsx: mobile style block` | On narrow phones, the lobby retained a 30px CTA with 60px horizontal padding and a spacious 55px panel inset. The panel competed with the title and easily dominated the usable height. | At <=900px, constrain to `100dvh`, reduce panel spacing and copy scale, and make the CTA 18px/24px. This is containment, not a studio redesign. |
| M3-08 | LOW — deferred | 1 | `BrainstormChat.tsx: stage header/input bar` | The studio uses desktop-scale header actions and a wrapping input bar, without a narrow-stage layout. At 320–375px the controls can consume multiple rows and leave little reading room above the keyboard. | Defer to the explicit mobile studio rebuild: establish a mobile header priority order, compact actions, keyboard-safe stage space, and tested 320px/landscape variants. |
| M3-09 | HIGH — fixed | 3, 5 | `BrainstormChat.tsx: startConversation` | The opening stream treated a mid-stream `{error}` as a completed partial question, then could speak/autosave/resume it. Its Retry button called `sendMessage()` with an empty composer, so it did nothing. | Roll back the partial opening, suppress its TTS tail, and route Retry to a fresh opening request. |
| M3-10 | HIGH — fixed | 3, 5 | `BrainstormChat.tsx: finishBrainstorm` | A summarize failure only logged to the console and stopped the spinner. On mobile, Finish appeared to do nothing even though the answers remained available. | Surface a retryable error and retry the summarize request, not a blank chat turn. |
| M3-11 | MED — fixed | 3, 5 | `BrainstormChat.tsx: unmount persistence effect` | A client-side route change may not emit `pagehide`; the per-render cleanup cancelled the debounce. A just-completed answer could therefore be absent from a returning-user session. | Flush the latest refs once on unmount while suppressing that write after a successful Finish. |
| M3-12 | MED — fixed | 1, 3 | `BrainstormChat.tsx: StudioShell` | The portalled studio did not inherit PageShell's safe-area policy and used a fixed 48px horizontal inset. Resume/voice-choice screens could crowd a cutout and waste phone width. | Use top/bottom display-cutout insets and responsive horizontal padding. |

## Top 10 launch/product risks
1. **M3-01 (fixed):** unsent memoir prose lost after interruption.
2. **M3-09 (fixed):** a failed opening was treated as real source material and could not be retried.
3. **M3-02 (fixed):** a completed session resurrected and could be summarized twice.
4. **M3-03 (fixed):** Finish trapped users after server success when storage is blocked.
5. **M3-10 (fixed):** Finish failed silently on a flaky connection.
6. **M3-04 (deferred):** no offline product contract despite a mobile-first conversation flow.
7. **M3-05 (fixed):** TTS could speak streamed sentences out of order.
8. **M3-06 (deferred):** no defined size/timeout experience for long answers.
9. **M3-08 (deferred):** narrow studio leaves insufficient reading space once the keyboard is up.
10. **M3-11 (fixed):** an SPA exit could discard the latest answer before its debounce fired.

## Decisions required from Kyle
1. Is Brainstorm intentionally online-only? If not, define the offline promise precisely: installability, assets available offline, draft retention period, encryption/key model, send/replay moment, conflict resolution, and wording.
2. What is the supported maximum for one typed/spoken answer and the whole Brainstorm session? Decide whether an over-limit answer is chunked, warned, or rejected, and what happens to it when the network times out.
3. For the mobile studio rebuild, which controls are always visible at 320px and with the iOS keyboard open? The current desktop-stage wrapping is not a product decision in code.
4. On return from a phone call/app switch, should hands-free remain manually paused (the safe shipped behavior) or should the app present an explicit “resume microphone” action? Automatic reacquisition is not acceptable.

## Shipped in this PR
- Draft-aware, backward-compatible local resume persistence.
- Finish cleanup that cannot resurrect/combine a completed session or block post-success navigation.
- Opening-stream and Finish recovery with the correct retry action and no partial source material.
- A final SPA-unmount session flush, safely disabled after successful Finish.
- Privacy-safe interruption handling for active playback and hands-free capture.
- Ordered TTS request queue with stop/background invalidation.
- Narrow-phone lobby density containment plus safe-area-aware studio prompts.
- `src/lib/__tests__/theo-m3-probes.test.ts`, including an `it.fails()` guard for the deliberately deferred PWA gap.

## Verification
- `npm exec tsc -- --noEmit` — passed.
- `npm test` — passed: 13 files, 197 assertions passed, 1 expected failure (the deliberate M3 PWA probe).
- `npm run build` — compilation and type validation passed, then static generation failed at `/blog` because this environment has no `supabaseUrl`. This is environment configuration, not an M3 compile/type failure.
