// /about page content, shared with /llms.txt and /llms-full.txt so the two
// cannot drift (SEO/GEO plan Phase 2, 2026-11-14). Moved verbatim out of
// src/app/about/page.tsx. Client-safe: constants only.

import { PLANS, PLAN_99, plan99 } from "@/lib/tiers";
import { SITE_URL } from "@/lib/site";
import { BASED_IN, FOUNDER_NAME } from "@/lib/founder";
import { GHOSTWRITER_COST, GHOSTWRITER_COST_SENTENCE } from "@/lib/ghostwriter-cost";

/** One quotable line naming the company, its founder and where it is based. */
export const FOUNDING_LINE = `D.scribe was founded in 2025 by ${FOUNDER_NAME} and is based in ${BASED_IN}.`;

export const DIFFERENTIATORS: readonly { title: string; body: string; source?: { label: string; url: string } }[] = [
  {
    title: "Built for spoken content, not typing",
    body: "Fiction tools like Sudowrite and NovelCrafter start from a blank page and a prompt. D.scribe starts from the recordings you already have — a sermon, a keynote, a coaching call. Sudowrite handles paragraphs. D.scribe handles books.",
  },
  {
    title: "One pipeline from audio to export",
    body: "ChatGPT and Claude can draft passages, but they keep no project memory and export no manuscript. D.scribe carries your book from upload through transcription, structure, drafting, editing, and a finished PDF or DOCX in one place.",
  },
  {
    title: "Book-length output, in your voice",
    body: "Repurposing tools like Castmagic and Descript cut your audio into clips and show notes. D.scribe builds a voice profile from how you actually talk and writes a full, coherent manuscript — the whole book, not the highlights.",
  },
  {
    title: "A ghostwriter alternative at a fraction of the cost",
    // The one sourced figure (src/lib/ghostwriter-cost.ts), same as /pricing.
    body: `${GHOSTWRITER_COST_SENTENCE}, according to ${GHOSTWRITER_COST.source}'s pricing guide. ${plan99() ? `D.scribe is $${PLAN_99.price} per month` : `D.scribe starts at $${PLANS.starter.price} per month`}. Same outcome: a finished manuscript in your voice.`,
    source: { label: `${GHOSTWRITER_COST.source}, "${GHOSTWRITER_COST.sourceTitle}"`, url: GHOSTWRITER_COST.url },
  },
  {
    title: "Pay for what you use",
    body: "Credits (called Ink) are shown before every AI action, unused credits roll over, and overage is blocked with a warning — never a surprise charge. A typical full 40,000-word book runs about 100 to 200 Ink.",
  },
];

export const WHO_USES: readonly string[] = [
  "Speakers and keynote presenters with a backlog of recorded talks",
  "Pastors turning sermons and sermon series into books",
  "Podcasters whose best episodes deserve a second life in print",
  "Coaches and consultants with training content worth publishing",
  "Course creators turning curriculum into a companion book",
  "Memoirists and family historians who tell stories better out loud",
];

export const HOW_IT_WORKS: readonly { title: string; body: string }[] = [
  {
    title: "How to start",
    body: "Sign in with Google and get 10 free Ink — no card required. Open a project and either talk with T.H.E.O, our brainstorming interviewer, or upload the recordings you already have.",
  },
  {
    title: "What you can upload",
    body: "Audio and video files (MP3, MP4, WAV, M4A), a YouTube link, or a live recording from your computer.",
  },
  {
    title: "How long it takes",
    body: "Most users go from upload to a full first draft in under an hour. Transcription takes minutes; chapters generate in 2 to 5 minutes each.",
  },
  {
    title: "Who does the writing",
    body: "D.scribe drafts; you decide. Every sentence lands in a built-in editor where you can rewrite, tighten, or add. Nothing is finished until you say it is.",
  },
  {
    title: "Support",
    body: "Email support at kyle@d-scribe.app — questions about your project, your plan, or your book.",
  },
];

export const KEY_FACTS: readonly [string, string][] = [
  ["Company name", "D.scribe"],
  ["Type", "AI book creation platform (voice-to-manuscript software)"],
  ["Founded", "2025"],
  ["Founder", FOUNDER_NAME],
  ["Based in", BASED_IN],
  ["Website", SITE_URL],
  ["Core offering", "Upload spoken audio or a YouTube link; D.scribe transcribes it, learns your voice, and drafts an export-ready manuscript"],
  ["Pricing", plan99()
    ? `Free trial with 10 Ink; one plan, ${PLAN_99.name} $${PLAN_99.price}/mo (${PLAN_99.ink.toLocaleString("en-US")} Ink, ${PLAN_99.books} a month)`
    : `Free trial with 10 Ink; Starter $${PLANS.starter.price}/mo (${PLANS.starter.ink.toLocaleString("en-US")} Ink); Pro $${PLANS.pro.price}/mo (${PLANS.pro.ink.toLocaleString("en-US")} Ink); Premium $${PLANS.premium.price}/mo (${PLANS.premium.ink.toLocaleString("en-US")} Ink)`],
  ["Contract terms", "Month-to-month, no long-term contract; unused Ink rolls over; overage is blocked with a warning, never charged silently"],
  ["Services", "AI transcription, brainstorm studio, voice profiling, chapter structuring, manuscript generation, sentence-level editing, PDF and DOCX export"],
  ["Communication", "Email support at kyle@d-scribe.app; in-app cost preview before every AI action"],
  ["Competitors", "Sudowrite, NovelCrafter, Scrivener, Castmagic, Descript, ChatGPT, Claude"],
];
