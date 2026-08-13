import type { Metadata } from "next";
import LandingPage from "@/app/landing-v2/page";

export const metadata: Metadata = {
  title: "D.scribe — Write your book as easily as you can talk about it.",
  description: "D.scribe helps pastors turn the wisdom they already speak into a book, with a guided path for coaches and speakers, too.",
  alternates: {
    canonical: "https://d-scribe.app",
  },
  openGraph: {
    title: "D.scribe — Write your book as easily as you can talk about it.",
    description: "For pastors with a message to share, D.scribe makes the path from spoken wisdom to book feel as natural as conversation.",
    url: "https://d-scribe.app",
    siteName: "D.scribe",
    type: "website",
  },
  twitter: {
    title: "D.scribe — Write your book as easily as you can talk about it.",
    description: "For pastors with a message to share, D.scribe makes the path from spoken wisdom to book feel as natural as conversation.",
  },
};

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "D.scribe",
  url: "https://d-scribe.app",
  description: "A guided path for pastors, coaches, and speakers to shape spoken wisdom into a book",
};

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "D.scribe — Write your book as easily as you can talk about it.",
  url: "https://d-scribe.app",
  description: "A guided path from spoken wisdom to a book, built first for pastors.",
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
        text: "Upload any audio recording — begin with a sermon, or use a coaching call, podcast episode, or voice memo. D.scribe captures your words, helps you build a structure around your chapter targets, and shapes them chapter by chapter. You remain involved at every step.",
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
        text: "That depends on the length of your recording and the book you want to make. You can begin with one sermon, review the first chapter, and keep shaping the manuscript at your own pace.",
      },
    },
    {
      "@type": "Question",
      name: "Who is D.scribe for?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "D.scribe is built first for pastors with sermons and teaching worth carrying beyond Sunday. It also serves coaches, speakers, consultants, and other people who think best out loud.",
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
