// Homepage FAQ — single source for the visible list (landing-v2/page.tsx) and
// the FAQPage JSON-LD (app/page.tsx), so the two cannot drift.
//
// Voice rules (D.scribe): no "unleash / revolutionize / supercharge /
// game-changer", no exclamation marks, speak to speakers, pastors and coaches,
// never label the output "AI-generated". Answers stay factual: every claim maps
// to a shipped feature (voice profile, content analysis, AI coherence pass,
// manuscript editor, PDF/DOCX export).

export type FaqItem = { q: string; a: string };

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    q: "How does D.scribe work?",
    a: "Enter the brainstorm studio to spend as much time as you like being interviewed by T.H.E.O, our specialist AI interviewer. Or, upload any existing audio — a sermon, a coaching call, a YouTube link, a podcast episode, or a voice memo. D.scribe transcribes it word-for-word, builds a structure based on your chapter targets, analyzes your themes and voice patterns, then generates a full manuscript chapter by chapter. The entire process takes minutes, not months.",
  },
  {
    q: "What audio formats does D.scribe support?",
    a: "D.scribe accepts MP3, MP4, WAV, M4A, and most common audio and video formats. You can also paste a YouTube link and D.scribe will pull the audio automatically.",
  },
  // HeyCatch 2026-09-10 item 8 (a)
  {
    q: "Will the manuscript sound like me or like an AI?",
    a: "Like you. Before a single chapter is written, D.scribe builds a voice profile from your recordings: your vocabulary, your sentence rhythm, the way you land a point from the pulpit or the stage. Every key point in the draft comes from your own words. Nothing invented. Nothing hallucinated. If a line drifts from how you would say it, rewrite it in the editor and the book stays yours.",
  },
  // HeyCatch 2026-09-10 item 8 (b)
  {
    q: "How does it maintain consistency across a multi-chapter, 40,000+ word book?",
    a: "D.scribe was meticulously built to analyze audio content that maps your themes, organizes your key points and plans the ideal structure of your book BEFORE text generation starts. After the draft, an AI coherence pass reads the manuscript end to end and smooths out repeated points, shifting terminology, or gaps between chapters. So chapter nine connects appropriately to chapter two and vice versa. It is built to handle a single conversation, years' worth of sermons, and everything in between.",
  },
  // HeyCatch 2026-09-10 item 8 (c)
  {
    q: "How much typing will I need to do?",
    a: "Less than starting from a blank page, but never none. The first draft arrives as a complete manuscript in the built-in editor, where every sentence is editable. Either insert your own text or use the 'Magic Edit' tool to tighten a story, cut a point, or add what's been left out. Nothing is finished until you say it is.",
  },
  {
    q: "How does Ink work?",
    a: "Ink is D.scribe's credit system. Every action that uses AI — brainstorming, transcription, analysis, chapter generation, etc. — costs a small amount of Ink. Starter plans include 300 Ink per month, Pro includes 660, and Premium includes 1,500. A typical full manuscript runs around 100–200 Ink depending on length. You can always see your balance before taking any action.",
  },
  {
    q: "How long does it take to generate a manuscript?",
    a: "Most users go from upload to a full first draft in under an hour. Transcription takes a few minutes; chapter generation typically runs 2–5 minutes per chapter depending on length.",
  },
  {
    q: "Who is D.scribe for?",
    a: "D.scribe is built for people who already have something to say — coaches, pastors, speakers, consultants, and experts who think best out loud. If you've been told you should write a book but never had the time or the process to do it, D.scribe is the bridge between your voice and a finished manuscript.",
  },
];

/** schema.org FAQPage built from the same items the page renders. */
export function faqSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}
