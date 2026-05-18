import type { Metadata } from "next";
import LandingPage from "@/app/landing-v2/page";

export const metadata: Metadata = {
  title: "D.scribe — Turn Your Voice Into a Published Book with AI",
  description: "D.scribe transcribes your voice recordings and turns them into a fully structured manuscript. Coaches, pastors, and speakers publish their books in days — not years.",
  alternates: {
    canonical: "https://d-scribe.app",
  },
  openGraph: {
    title: "D.scribe — Turn Your Voice Into a Published Book with AI",
    description: "Upload any audio, set your structure, and watch AI write your manuscript chapter by chapter — in your voice.",
    url: "https://d-scribe.app",
    siteName: "D.scribe",
    type: "website",
  },
};

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "D.scribe",
  url: "https://d-scribe.app",
  description: "AI-powered voice-to-manuscript software for coaches, pastors, and speakers",
};

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "D.scribe — Turn Your Voice Into a Published Book with AI",
  url: "https://d-scribe.app",
  description: "Upload audio, transcribe, and generate your book manuscript with AI",
  isPartOf: { "@type": "WebSite", name: "D.scribe", url: "https://d-scribe.app" },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How does D.scribe work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Upload any audio recording — a sermon, a coaching call, a podcast episode, or a voice memo. D.scribe transcribes it word-for-word, builds a structure based on your chapter targets, analyzes your themes and voice patterns, then generates a full manuscript chapter by chapter.",
      },
    },
    {
      "@type": "Question",
      name: "What audio formats does D.scribe support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "D.scribe accepts MP3, MP4, WAV, M4A, and most common audio and video formats. You can also paste a YouTube link and D.scribe will pull the audio automatically.",
      },
    },
    {
      "@type": "Question",
      name: "How does Ink work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Ink is D.scribe's credit system. Every action that uses AI — transcription, analysis, chapter generation — costs a small amount of Ink. Starter plans include 300 Ink per month, Pro includes 660, and Premium includes 1,500. A typical full manuscript runs around 100–200 Ink depending on length. You can always see your balance before taking any action.",
      },
    },
    {
      "@type": "Question",
      name: "How long does it take to generate a manuscript?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most users go from upload to a full first draft in under an hour. Transcription takes a few minutes; chapter generation typically runs 2–5 minutes per chapter depending on length.",
      },
    },
    {
      "@type": "Question",
      name: "Who is D.scribe for?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "D.scribe is built for people who already have something to say — coaches, pastors, speakers, consultants, and experts who think best out loud. If you've been told you should write a book but never had the time or the process to do it, D.scribe is the bridge between your voice and a finished manuscript.",
      },
    },
  ],
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <LandingPage />
    </>
  );
}
