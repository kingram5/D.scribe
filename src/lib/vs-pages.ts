/**
 * /vs/[slug] comparison data (HeyCatch action plan, "Do this quarter").
 *
 * Rules for everything in this file:
 *   1. Every competitor claim is taken from the HeyCatch competitor research
 *      (product/competitors.txt) which was fetched from the competitors' own
 *      public pages on 2026-09-10. Nothing here is invented.
 *   2. Every competitor entry carries a `stronger` line. An honest comparison
 *      page converts because it concedes what is true; a rigged one reads as
 *      marketing and gets bounced.
 *   3. No em dashes, no "not X but Y" constructions.
 */

export type VsRow = {
  label: string;
  ds: string;
  them: string;
};

export type VsPage = {
  slug: string;
  competitor: string;
  /** Their one-line category claim, verbatim from their own page. */
  theirClaim: string;
  /** Why someone lands on this comparison at all. */
  intro: string;
  /** The single sentence that is the whole page. */
  verdict: string;
  rows: VsRow[];
  /** What the competitor genuinely does better. Required, not optional. */
  stronger: string;
  /** Who should pick them instead. */
  pickThem: string;
  /** Who should pick D.scribe. */
  pickUs: string;
  faqs: { q: string; a: string }[];
};

export const D_SCRIBE_PRICING =
  "Starter $25/mo (300 Ink, about 1.5 books), Pro $50/mo (660 Ink, about 3 books, plus about 30 min/month of spoken brainstorming), Premium $100/mo (1,500 Ink, about 7 books, plus about 80 min/month).";

export const SOURCED_NOTE =
  "Competitor details were read from their own public pages on 10 September 2026 and reflect what they advertised then. Prices and features change. Check their site before you buy.";

export const VS_PAGES: VsPage[] = [
  {
    slug: "builtwritten",
    competitor: "Built&Written",
    theirClaim: "Your book. In your voice. Print-ready in 5 minutes.",
    intro:
      "Built&Written is the closest product to D.scribe on the market. Same buyer (coaches, founders, consultants), same promise (your material becomes a finished book), same shape (self-serve subscription software). If you are comparing us to anyone, it is them.",
    verdict:
      "Both turn what you already have into a book. The real difference is what you feed in: they read your writing, we listen to you talk.",
    rows: [
      {
        label: "What you put in",
        ds: "Raw audio: sermons, coaching calls, keynotes, voice memos, podcast episodes.",
        them: "Text you already wrote: notes, LinkedIn posts, podcast transcripts.",
      },
      {
        label: "Entry price",
        ds: "$25/month (Starter).",
        them: "$15/month billed annually ($180/yr), or $19/month monthly.",
      },
      {
        label: "Is the cheapest tier full software?",
        ds: "Yes. Every plan includes AI transcription, voice profile, chapter generation, coherence pass, and PDF/DOCX export. Tiers differ only on capacity.",
        them: "No. The Author tier is editor-only and does not include AI book writing. AI generation starts on the Entrepreneur tier at $49/month.",
      },
      {
        label: "Spoken ideation",
        ds: "Built in on Pro and above: a spoken brainstorming session where the AI interviews you out loud and you answer by voice.",
        them: "Not offered.",
      },
      {
        label: "Free trial",
        ds: "10 Ink free to start.",
        them: "No free tier visible. A 7-day money-back guarantee instead.",
      },
      {
        label: "Where the book ends up",
        ds: "PDF and DOCX you own and can edit.",
        them: "Print-ready Amazon KDP output, which is their headline strength.",
      },
      {
        label: "Independent reviews",
        ds: "Early. This is our weakest area and we are not going to dress it up.",
        them: "Trustpilot and G2 at 4.7 of 5 from 9 reviews, plus 13 or more named testimonials with titles and tenure.",
      },
    ],
    stronger:
      "Proof and print-readiness. Built&Written has real third-party reviews and named testimonials with photos, and their KDP export is genuinely further along than ours. If proof from strangers is what unlocks your purchase, that gap matters.",
    pickThem:
      "You already write a lot and want to assemble existing text into a KDP-ready book, and you want a review history from other buyers before you commit.",
    pickUs:
      "You think out loud rather than write, and the raw material is sitting in recordings you never transcribed. D.scribe is built for the person who has 47 coaching calls and no manuscript.",
    faqs: [
      {
        q: "Is D.scribe cheaper than Built&Written?",
        a: "$25/month monthly versus their $19/month monthly on the entry tier. Their annual rate of $15/month is lower, but that tier is editor-only. Comparable AI book generation on their side starts at $49/month.",
      },
      {
        q: "Can I use my existing notes and posts with D.scribe?",
        a: "Yes, but audio is the native input. Text works better on Built&Written, which is designed around material you have already written.",
      },
      {
        q: "Does D.scribe export to Amazon KDP?",
        a: "D.scribe exports PDF and DOCX, which you can format for KDP. Built&Written produces print-ready KDP output directly, and that is a real advantage for them.",
      },
    ],
  },
  {
    slug: "squibler",
    competitor: "Squibler",
    theirClaim: "AI Book and Novel Writer. Turn Your Idea into a Story.",
    intro:
      "Squibler is the largest player in the category by user count, with more than 20,000 writers. It is built around chatting with an AI to write fiction and screenplays. That is a different job from turning a speaker's recordings into a nonfiction manuscript.",
    verdict:
      "Squibler helps you invent a story. D.scribe helps you keep the one you already told.",
    rows: [
      {
        label: "Built for",
        ds: "Nonfiction: coaches, pastors, speakers, consultants who already have the material in their voice.",
        them: "Fiction, novels, and screenplays, plus some nonfiction.",
      },
      {
        label: "How the draft happens",
        ds: "You upload recordings. D.scribe transcribes, builds a voice profile, and drafts chapter by chapter.",
        them: "You chat with the AI and direct the story as you go.",
      },
      {
        label: "Entry price",
        ds: "$25/month (Starter), 300 Ink.",
        them: "Free tier with 1,000 credits/month. Plus is $15.83/month billed annually, normally $29.99/month, with 10,000 credits. Pro is $49.17/month annually, normally $89.99/month, unlimited credits.",
      },
      {
        label: "Free option",
        ds: "10 Ink to start.",
        them: "Yes, a real ongoing free tier. This is a genuine advantage for them.",
      },
      {
        label: "Voice authenticity",
        ds: "Transcripts are taken from your own audio, and a voice profile is built from them.",
        them: "The AI writes in a style you steer through the chat and their style tools.",
      },
      {
        label: "Spoken ideation",
        ds: "Spoken brainstorming on Pro and above, where the AI interviews you out loud.",
        them: "Not offered.",
      },
      {
        label: "Track record",
        ds: "Early. Not going to pretend otherwise.",
        them: "More than 20,000 writers and named testimonials with photos.",
      },
    ],
    stronger:
      "Scale, price of entry, and a free tier that is actually usable. If you want to test AI book writing at zero cost, Squibler lets you do that today and we do not. They also support far more genres.",
    pickThem:
      "You are writing fiction, a novel, or a screenplay, or you want to experiment for free before spending anything.",
    pickUs:
      "You are writing nonfiction, the source material already exists as audio, and you need the finished manuscript to sound like you rather than like a chatbot you directed.",
    faqs: [
      {
        q: "Does D.scribe have a free plan like Squibler?",
        a: "No. D.scribe gives you 10 Ink to start. Squibler has a standing free tier with 1,000 credits a month, which is a better deal if you are only experimenting.",
      },
      {
        q: "Can D.scribe write fiction?",
        a: "It is designed for nonfiction from your own recordings. For novels and screenplays, Squibler is the better fit.",
      },
      {
        q: "How much does D.scribe cost compared to Squibler's paid tiers?",
        a: "D.scribe Starter is $25/month at full price. Squibler Plus is $15.83/month billed annually, normally $29.99/month, and Pro is $49.17/month annually, normally $89.99/month.",
      },
    ],
  },
  {
    slug: "dictate",
    competitor: "Dictate",
    theirClaim: "Turn Your Expertise Into a Published Book.",
    intro:
      "Dictate is not software. It is a done-for-you ghostwriting service that starts around $4,997 and usually begins with a discovery call. It is the most expensive option in the category and, for people who want a human in the loop, the most hands-off.",
    verdict:
      "Dictate sells you a service. D.scribe sells you the tool. One costs about 200 times more and takes far longer, and for some people that is exactly the right trade.",
    rows: [
      {
        label: "What you are buying",
        ds: "Self-serve software you run yourself.",
        them: "A service. AI-guided interviews with human involvement and a done-for-you process.",
      },
      {
        label: "Price",
        ds: D_SCRIBE_PRICING,
        them: "Starts at $4,997 as a one-time project fee. A free discovery call is the entry point.",
      },
      {
        label: "Time to first draft",
        ds: "Minutes to hours, because you drive it.",
        them: "Weeks, because it is an interview and production process.",
      },
      {
        label: "Voice capture",
        ds: "Voice profile built from your uploaded recordings.",
        them: "Voice DNA, with a published claim of 95% or higher match.",
      },
      {
        label: "How you are guided",
        ds: "Spoken brainstorming on Pro and above. You still make every call.",
        them: "Structured AI-guided interviews with a Content Scorecard, plus phone-based sales and onboarding.",
      },
      {
        label: "How you test it",
        ds: "10 Ink free, no call required.",
        them: "Discovery call only. You cannot try the product before paying.",
      },
      {
        label: "Who does the work",
        ds: "You, with the software doing the drafting.",
        them: "Largely handled for you, which is the entire point of the price.",
      },
    ],
    stronger:
      "Human guidance and a finished result you did not have to drive. If you want to talk to a person, hand over the work, and have someone else manage the process, Dictate is built for that and D.scribe is not.",
    pickThem:
      "You have a real budget for your book, you want a guided human process, and you would rather pay for someone else to run it.",
    pickUs:
      "You want to keep control, you want a first draft this week rather than this quarter, and $4,997 is not a number you are willing to spend on a manuscript.",
    faqs: [
      {
        q: "Is D.scribe a cheaper version of Dictate?",
        a: "They are different products. Dictate is a done-for-you ghostwriting service starting around $4,997. D.scribe is software from $25/month that you operate yourself.",
      },
      {
        q: "Do I get to talk to a human with D.scribe?",
        a: "Not in the way Dictate provides. Spoken brainstorming on Pro and Premium lets the AI interview you out loud, but there is no human ghostwriter or account manager.",
      },
      {
        q: "Can I try before paying?",
        a: "Yes. D.scribe gives you 10 Ink to start with no call. Dictate's entry point is a free discovery call.",
      },
    ],
  },
];

export function getVsPage(slug: string): VsPage | undefined {
  return VS_PAGES.find((p) => p.slug === slug);
}