# GEO baseline: does AI name D.Scribe?

The 10 prompts below are frozen. Re-run the same 10, word for word, every time so results stay comparable. The Phase 6 weekly checker reads this list rather than keeping its own copy.

## The 10 prompts
1. best AI tool to write a book
2. ghostwriting software
3. app that turns interviews into a book
4. AI book writing assistant for non-writers
5. best AI to turn my sermons into a book
6. how can I turn my podcast episodes into a book
7. AI tool to write a memoir from voice recordings
8. software that turns my recorded talks and speeches into a book
9. affordable alternative to hiring a ghostwriter for my book
10. can I write a book by talking instead of typing? what app should I use

Prompts 1-4 come from the plan. Prompts 5-10 cover the audiences the site targets (pastors, podcasters, speakers, memoirists) and the ghostwriter-alternative intent.

## Method
- One fresh chat per prompt, with no prior conversation and no custom instructions.
- Each result records the engine, whether the session was signed in, and whether the engine ran a web search.
- Mentions are counted by name: "D.Scribe", "D.scribe" or "d-scribe.app".

## Results (2026-11-14)

**Headline: D.Scribe is named in 0 of 30 answers across the 3 engines that could be checked.** It also does not appear in Google's top 15 for any of the 10 intent queries.

### Engines
| Engine | How it was checked | Answers | D.Scribe named | Web search |
|---|---|---|---|---|
| ChatGPT | chatgpt.com, signed out, fresh chat per prompt | 10 | 0 | Source links in 9 of 10 answers |
| Gemini | gemini.google.com, signed-in session, **temporary chat** (no history, no personal context) | 10 | 0 | Not visible in the captured text |
| Perplexity | **Sonar API** (model `sonar`). The website answers signed-out visitors with "Sign up and repeat your request". | 10 | 0 | Yes, 10 citations each |
| Claude | not checked: needs login | - | - | - |
| Grok | not checked: needs login (signed-out visitors get "Sign up to continue") | - | - | - |

- The Perplexity row comes from the API, not the consumer website. Sonar runs the same live web search, but the answer can differ from what a signed-in user sees.
- ChatGPT answered prompt 2 ("ghostwriting software") with a clarifying question and named no tools.

### Who gets named instead
Counts are how many of the 30 answers name each product. Each engine's mentions of itself are excluded.

| Product | Answers | Notes |
|---|---|---|
| Claude / ChatGPT / Gemini (general assistants) | 18 / 13 / 0 | Recommended as do-it-yourself drafting tools |
| Descript | 10 | Transcription step for podcast and talk prompts |
| Otter.ai | 9 | Transcription step |
| Sudowrite | 9 | The default "best AI book writer" answer (fiction) |
| Scrivener | 8 | Manuscript organizer |
| Squibler | 7 | Has a D.Scribe /vs page |
| Built&Written | 7 | Has a D.Scribe /vs page. The closest competitor, named by Perplexity on 5 of 10. |
| Novelcrafter | 6 | Fiction |
| ProWritingAid | 6 | Editing |
| Remento | 5 | Memoir from voice |

- **Voice-to-book and niche names that showed up:**
  - Sermons: Aligned, SermonBook.ai, SermonAI.
  - Memoir: Memoir.bot, MemoirMaker, Namoo, AudioPen.
  - Podcasts: PodToBook.
  - Book writers: Bookwiz, Type.ai, Inkfluence.
- **Takeaway:** for the voice-first prompts (5-10), the engines stitch together "transcribe with Otter or Descript, then draft with Claude or ChatGPT". That two-tool workflow is exactly the one D.Scribe replaces, and no engine names a single tool for it.

### Google (signed-in session with `pws=0`, so some personalization may remain)
| Query | d-scribe.app position | Notes |
|---|---|---|
| D.Scribe | 4 | dscryb.com, dscribe.in and dscribeapp.com rank above it (name collision) |
| dscribe app | not in top 15 | dscribeapp.com (a different app) and App Store results take the page |
| d-scribe.app | 1 | |
| D.Scribe book app | 1 | |
| D.Scribe voice to book | 1 | |
| site:d-scribe.app | indexed | Results shown. The exact count was not captured. |
| All 10 intent prompts | not in top 15 | Top results: Reddit, Built&Written, Inkfluence, memoir.bot, aligned.church, sermonkeeper.app, yourbook.pro, Kindlepreneur |

- **Knowledge panel:** none detected for any query.
- **Sitelinks:** not checked.
- **AI Overview:** present on most queries. On the intent queries it never names D.Scribe. On the branded queries the overview text matches "dscribe", but the brand collision with dscribeapp.com means a D.Scribe mention there was not confirmed.

### Raw answers
The per-answer text was saved locally for this run and is not committed: it is third-party output. The Phase 6 weekly checker reruns these same 10 prompts and appends one row per engine per prompt to `geo-tracking.csv`.
