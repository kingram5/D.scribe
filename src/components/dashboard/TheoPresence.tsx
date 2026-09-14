"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// THEO in the room. His idle loop (the studio's alpha video) stands beside the
// bookcase on wide screens, and a line of his in the studio's glass floats at his
// shoulder: a greeting, then the offer to pick up the most recent book. Reduced
// motion gets the still portrait instead of the loop. Nothing here is required
// for the dashboard to work; it is the host of the room saying hello.

export interface TheoPresenceProps {
  ownerName: string;
  /** The book he offers to pick up (most recently touched, not finished). */
  pickUp?: { title: string; href: string } | null;
}

export default function TheoPresence({ ownerName, pickUp }: TheoPresenceProps) {
  const [phase, setPhase] = useState<"dots" | "hello" | "offer">("dots");
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) setStill(true);
    const a = window.setTimeout(() => setPhase("hello"), 1400);
    const b = window.setTimeout(() => setPhase("offer"), 4200);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, []);

  const hello = ownerName ? `Welcome back, ${ownerName}.` : "Welcome back.";
  return (
    <div className="bs-theo" aria-hidden={phase === "dots"}>
      <style>{CSS}</style>
      <div className={`bs-theo-line bs-glass bs-theo-line-${phase}`} role="status">
        {phase === "dots" && <span className="ds-stage-dots bs-theo-dots">· · ·</span>}
        {phase === "hello" && <span className="bs-theo-text">{hello} Where were we?</span>}
        {phase === "offer" && (
          pickUp ? (
            <span className="bs-theo-text">
              You were in the middle of <em>{pickUp.title}</em>.{" "}
              <Link href={pickUp.href} className="bs-theo-go">Pick up with THEO &rarr;</Link>
            </span>
          ) : (
            <span className="bs-theo-text">
              The shelf has room. <Link href="/project/new" className="bs-theo-go">Start a new book &rarr;</Link>
            </span>
          )
        )}
      </div>
      <div className="bs-theo-figure">
        {still ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/theo-poster-alpha.png" alt="" className="bs-theo-media" draggable={false} />
        ) : (
          <video className="bs-theo-media" autoPlay muted loop playsInline preload="metadata" poster="/theo-poster-alpha.png" disablePictureInPicture disableRemotePlayback>
            <source src="/theo-idle-alpha.webm" type='video/webm; codecs="vp9"' />
            <source src="/theo-idle.mp4" type="video/mp4" />
          </video>
        )}
        <div className="bs-theo-floor" />
      </div>
    </div>
  );
}

const CSS = `
.bs-theo { position: fixed; right: 12px; bottom: 0; width: 320px; z-index: 2; pointer-events: none; display: none; }
@media (min-width: 1500px) { .bs-theo { display: block; } }
.bs-theo-figure { position: relative; width: 320px; height: 440px; animation: bs-theo-in 900ms cubic-bezier(0.22, 0.8, 0.2, 1) both; animation-delay: 500ms; }
@keyframes bs-theo-in { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
.bs-theo-media { position: absolute; left: 50%; bottom: -6px; height: 100%; width: auto; transform: translateX(-50%); display: block; filter: drop-shadow(0 20px 30px rgba(0,0,0,0.6)) brightness(0.96); mask-image: linear-gradient(180deg, #000 0%, #000 84%, transparent 100%); -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 84%, transparent 100%); }
.bs-theo-floor { position: absolute; left: 20%; right: 20%; bottom: 8px; height: 26px; border-radius: 50%; background: radial-gradient(ellipse, rgba(0,0,0,0.55), transparent 70%); }
.bs-theo-line {
  position: absolute; right: 250px; bottom: 360px; width: 300px; padding: 12px 14px; pointer-events: auto;
  font-family: var(--font-lora), serif; font-size: 14px; line-height: 1.5; color: #F9F7F2;
  animation: bs-theo-pop 520ms cubic-bezier(0.2, 1.35, 0.3, 1) both;
}
.bs-theo-line::after { content: ""; position: absolute; right: -6px; bottom: 18px; width: 12px; height: 12px; background: rgba(26,22,16,0.9); border-right: 1px solid rgba(249,247,242,0.14); border-bottom: 1px solid rgba(249,247,242,0.14); transform: rotate(-45deg); }
.bs-theo-line-dots { width: auto; padding: 10px 16px; }
.bs-theo-dots { font-family: var(--font-geist-mono), monospace; letter-spacing: 0.2em; color: rgba(249,247,242,0.7); }
.bs-theo-text em { font-style: italic; color: #F4D69C; }
.bs-theo-go { display: inline-block; margin-top: 6px; color: #E29B6D; font-family: var(--font-manrope), sans-serif; font-weight: 700; font-size: 13px; text-decoration: none; }
.bs-theo-go:hover { text-decoration: underline; }
@keyframes bs-theo-pop { 0% { opacity: 0; transform: translateY(10px) scale(0.96); } 100% { opacity: 1; transform: none; } }
`;
