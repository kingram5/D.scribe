import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/components/landing/og-card";

// Homepage og:image (HeyCatch item 7). Served at /opengraph-image; the
// middleware lists that path as public so crawlers are not bounced to /login.
export const alt = "D.scribe — Turn Your Voice Into a Published Book with AI";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    eyebrow: "Voice to manuscript",
    title: "Turn Your Voice Into a Published Book.",
    subtitle: "D.scribe transcribes your sermons, coaching calls, and keynotes, then writes your manuscript chapter by chapter in your voice.",
  });
}
