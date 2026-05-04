"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CinematicMurmurWaveform } from "@/components/landing/CinematicClient";

const PIPELINE = [
  { num: "01", title: "Upload", desc: "Record live, upload an audio file, or paste a YouTube link. Any spoken word becomes raw material." },
  { num: "02", title: "Transcribe", desc: "AI captures every word exactly as spoken — speaker detection, timestamps, the full picture." },
  { num: "03", title: "Analyze", desc: "Key themes extracted, voice profile built, narrative arcs identified. Your ideas, mapped." },
  { num: "04", title: "Outline", desc: "Chapters structured around your strongest ideas. Drag, reorder, refine until it clicks." },
  { num: "05", title: "Generate", desc: "AI writes your manuscript chapter by chapter — in your voice, not a robot's." },
  { num: "06", title: "Export", desc: "Download your finished book as PDF or DOCX. Print-ready. Publisher-ready. Yours." },
];

function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.15) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return visible;
}

function FadeSection({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(24px)",
      transition: `opacity 0.6s ease-out ${delay}s, transform 0.6s ease-out ${delay}s`,
    }}>
      {children}
    </div>
  );
}

export default function LandingV2() {
  const [scrolled, setScrolled] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 50); }
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = 0.75;
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches && videoRef.current) {
      videoRef.current.pause();
    }
  }, []);

  return (
    <div className="landing-v2" style={{ background: "#2C2419", color: "#F9F7F2", minHeight: "100vh" }}>

      {/* ─── Navbar ─── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "0 40px", height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "all 0.3s ease",
        background: scrolled ? "rgba(44,36,25,0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(249,247,242,0.08)" : "1px solid transparent",
      }}>
        {/* Box logo + scribe */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36,
            border: "1.5px solid rgba(249,247,242,0.75)",
            borderRadius: 5,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-playfair), 'Playfair Display', serif",
            fontStyle: "italic", fontWeight: 700, fontSize: 17, color: "#F9F7F2",
            flexShrink: 0,
          }}>
            D.
          </div>
          <span style={{
            fontFamily: "var(--font-lora), 'Lora', serif",
            fontSize: 18, fontWeight: 500, color: "#F9F7F2",
          }}>
            scribe
          </span>
        </div>
        {/* Nav right */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <Link href="/login" style={{
            fontSize: 14, color: "#F9F7F2", textDecoration: "none",
            fontFamily: "var(--font-lora), serif", opacity: 0.85,
          }}>
            Sign in
          </Link>
          <Link href="/auth/signup" className="lv2-pill-cta">
            Get Started →
          </Link>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section style={{ position: "relative", height: "100vh", overflow: "hidden" }}>

        {/* Video background */}
        <video
          ref={videoRef}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", objectPosition: "center center",
            willChange: "transform", transform: "translate3d(0,0,0)",
          }}
          autoPlay loop muted playsInline preload="auto"
          disablePictureInPicture disableRemotePlayback
        >
          <source src="/bg-video-desk.mp4" type="video/mp4" />
        </video>

        {/* Overlay — light vignette, let video breathe */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `
            linear-gradient(to bottom,
              rgba(44,36,25,0.38) 0%,
              rgba(44,36,25,0.05) 22%,
              rgba(44,36,25,0.05) 55%,
              rgba(44,36,25,0.62) 85%,
              rgba(44,36,25,0.80) 100%
            ),
            linear-gradient(to right,
              rgba(44,36,25,0.42) 0%,
              transparent 30%,
              transparent 75%,
              rgba(44,36,25,0.18) 100%
            )
          `,
        }} />

        {/* ── Animated D.scribe waveform logo — center, upper-mid ── */}
        <div style={{
          position: "absolute",
          top: "14%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "82%",
          height: "30vh",
          zIndex: 2,
          pointerEvents: "none",
        }}>
          <CinematicMurmurWaveform />
        </div>

        {/* ── Your Story Starts → [HERE] — centered below logo ── */}
        <div style={{
          position: "absolute",
          top: "50%",
          left: 0, right: 0,
          zIndex: 2,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 20,
        }}>
          <span style={{
            fontFamily: "var(--font-playfair), 'Playfair Display', serif",
            fontStyle: "italic",
            fontSize: "clamp(17px, 1.9vw, 26px)",
            color: "#F0E6CE",
            opacity: 0.9,
          }}>
            Your Story Starts →
          </span>
          <Link href="/auth/signup" className="lv2-pill-here">
            HERE
          </Link>
        </div>

        {/* ── You talk. It writes. — centered ── */}
        <div style={{
          position: "absolute",
          top: "58%",
          left: 0, right: 0,
          zIndex: 2,
          textAlign: "center",
        }}>
          <div style={{
            fontFamily: "var(--font-playfair), 'Playfair Display', serif",
            fontSize: "clamp(24px, 3.2vw, 44px)",
            fontWeight: 400,
            color: "#F9F7F2",
            lineHeight: 1.2,
            marginBottom: 8,
          }}>
            You talk.{" "}
            <em style={{ color: "#F0E6CE" }}>It writes.</em>
          </div>
          <div style={{
            fontFamily: "var(--font-lora), 'Lora', serif",
            fontSize: 15,
            color: "rgba(249,247,242,0.58)",
            marginBottom: 3,
          }}>
            Stop waiting to write your book...
          </div>
          <div style={{
            fontFamily: "var(--font-lora), 'Lora', serif",
            fontSize: 15,
            fontWeight: 600,
            color: "rgba(249,247,242,0.82)",
          }}>
            just start talking.
          </div>
        </div>

        {/* ── There's an author inside you — bottom-left ── */}
        <div style={{
          position: "absolute",
          top: "52%",
          left: 40,
          zIndex: 2,
          maxWidth: 300,
        }}>
          <h2 style={{
            fontFamily: "var(--font-playfair), 'Playfair Display', serif",
            fontSize: "clamp(26px, 3vw, 42px)",
            fontWeight: 800,
            lineHeight: 1.1,
            color: "#F9F7F2",
            marginBottom: 10,
          }}>
            There&rsquo;s an<br />author<br />
            <span style={{ fontStyle: "italic", fontWeight: 400, color: "#D98B58" }}>
              inside you.
            </span>
          </h2>
          <p style={{
            fontFamily: "var(--font-lora), 'Lora', serif",
            fontSize: 13,
            lineHeight: 1.6,
            color: "rgba(249,247,242,0.52)",
            marginBottom: 20,
          }}>
            Your recordings, transcribed and shaped into a finished manuscript. You speak — D.&thinsp;scribe writes.
          </p>
          <Link href="/auth/signup" className="lv2-ghost">
            Begin Your Book
          </Link>
        </div>

        {/* ── Bottom stats strip ── */}
        <div style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          zIndex: 2,
          display: "flex",
          justifyContent: "center",
          gap: "clamp(28px, 5.5vw, 72px)",
          padding: "16px 40px",
          background: "rgba(44,36,25,0.42)",
          backdropFilter: "blur(10px)",
        }}>
          {[
            { value: "< 10 min", label: "Audio to first chapter" },
            { value: "6 steps",  label: "From voice to published book" },
            { value: "Your voice", label: "AI writes in your style, not its own" },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <div style={{
                fontFamily: "var(--font-playfair), serif",
                fontSize: "clamp(15px, 1.7vw, 22px)",
                fontWeight: 700,
                color: "#C17A47",
                marginBottom: 2,
              }}>
                {stat.value}
              </div>
              <div style={{
                fontFamily: "var(--font-lora), serif",
                fontSize: 12,
                color: "rgba(249,247,242,0.52)",
              }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Pipeline Section ─── */}
      <section style={{ padding: "96px 40px", maxWidth: 800, margin: "0 auto" }}>
        <FadeSection>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <h2 style={{
              fontFamily: "var(--font-playfair), serif", fontStyle: "italic",
              fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 400, marginBottom: 12,
            }}>
              Six steps. One manuscript.
            </h2>
            <p style={{ fontFamily: "var(--font-lora), serif", fontSize: 16, color: "#A89F94" }}>
              From the first word you speak to the last page you export.
            </p>
          </div>
        </FadeSection>
        <div style={{ position: "relative" }}>
          <div style={{
            position: "absolute", left: 36, top: 0, bottom: 0, width: 1,
            background: "rgba(193,122,71,0.2)",
          }} />
          {PIPELINE.map((step, i) => (
            <FadeSection key={step.num} delay={i * 0.08}>
              <div style={{
                display: "grid", gridTemplateColumns: "72px 1fr", gap: 24,
                padding: "28px 0",
                borderBottom: i < PIPELINE.length - 1 ? "1px solid rgba(249,247,242,0.04)" : "none",
              }}>
                <div style={{
                  fontFamily: "var(--font-playfair), serif", fontSize: 56, fontWeight: 300,
                  color: "rgba(193,122,71,0.2)", lineHeight: 1, textAlign: "center",
                }}>
                  {step.num}
                </div>
                <div>
                  <h3 style={{
                    fontFamily: "var(--font-playfair), serif", fontSize: 22, fontWeight: 700,
                    marginBottom: 6, color: "#F9F7F2",
                  }}>
                    {step.title}
                  </h3>
                  <p style={{
                    fontFamily: "var(--font-lora), serif", fontSize: 16, lineHeight: 1.7, color: "#A89F94",
                  }}>
                    {step.desc}
                  </p>
                </div>
              </div>
            </FadeSection>
          ))}
        </div>
      </section>

      {/* ─── Human + AI Collaboration ─── */}
      <FadeSection>
        <section style={{
          padding: "96px 40px",
          background: "linear-gradient(to bottom, rgba(193,122,71,0.04), transparent)",
          borderTop: "1px solid rgba(249,247,242,0.06)",
        }}>
          <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
            <div style={{
              fontFamily: "var(--font-lora), serif", fontSize: 13,
              textTransform: "uppercase", letterSpacing: "0.14em",
              color: "#C17A47", marginBottom: 16, fontWeight: 600,
            }}>
              Human + AI
            </div>
            <h2 style={{
              fontFamily: "var(--font-playfair), serif", fontStyle: "italic",
              fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 400,
              lineHeight: 1.2, marginBottom: 24,
            }}>
              You bring the voice.<br />We bring the pen.
            </h2>
            <p style={{
              fontFamily: "var(--font-lora), serif", fontSize: 18, lineHeight: 1.7,
              color: "#A89F94", maxWidth: 540, margin: "0 auto 40px",
            }}>
              D.&thinsp;scribe doesn&rsquo;t replace your ideas — it listens, learns your voice, and shapes your spoken words into prose that sounds like you wrote it by hand.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32, marginTop: 48 }} className="lv2-pillars">
              {[
                { title: "Your Voice", desc: "AI captures your speaking style — rhythm, vocabulary, pacing — and writes in it." },
                { title: "Your Ideas", desc: "Every key point comes from your words. Nothing invented. Nothing hallucinated." },
                { title: "Your Book", desc: "Edit every sentence. Rearrange every chapter. Export when it's ready. It's yours." },
              ].map((pillar) => (
                <div key={pillar.title} style={{ textAlign: "left" }}>
                  <div style={{ width: 32, height: 2, background: "#C17A47", marginBottom: 16, opacity: 0.6 }} />
                  <h3 style={{ fontFamily: "var(--font-playfair), serif", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                    {pillar.title}
                  </h3>
                  <p style={{ fontFamily: "var(--font-lora), serif", fontSize: 15, lineHeight: 1.6, color: "#A89F94" }}>
                    {pillar.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ─── Final CTA ─── */}
      <FadeSection>
        <section style={{
          padding: "96px 40px", textAlign: "center",
          borderTop: "1px solid rgba(249,247,242,0.06)",
        }}>
          <h2 style={{
            fontFamily: "var(--font-playfair), serif",
            fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 800,
            lineHeight: 1.1, marginBottom: 12,
          }}>
            Stop waiting to write<br />
            <span style={{ fontStyle: "italic", fontWeight: 400, color: "#D98B58" }}>your book.</span>
          </h2>
          <p style={{
            fontFamily: "var(--font-lora), serif", fontSize: 18,
            color: "#A89F94", maxWidth: 400, margin: "0 auto 40px",
          }}>
            Just start talking.
          </p>
          <Link href="/auth/signup" className="lv2-cta">
            Begin Your Book
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </section>
      </FadeSection>

      {/* ─── Footer ─── */}
      <footer style={{
        padding: "32px 40px",
        borderTop: "1px solid rgba(249,247,242,0.06)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 16,
      }}>
        <span style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontSize: 14, color: "#A89F94" }}>
          D. scribe &mdash; Your Voice, Written
        </span>
        <span style={{ fontSize: 12, color: "rgba(168,159,148,0.5)" }}>
          &copy; {new Date().getFullYear()} Ingram Family AI
        </span>
      </footer>

      {/* ─── Styles ─── */}
      <style>{`
        /* Waveform bar animation for landing-v2 */
        .landing-v2 .murmur-svg {
          width: 100%;
          height: auto;
          overflow: visible;
        }
        .landing-v2 .bar {
          fill: #F0E6CE;
          transform-box: fill-box;
          transform-origin: center;
          animation: lv2-murmurWave var(--anim-duration, 2s) cubic-bezier(0.4, 0, 0.2, 1) infinite alternate;
          animation-delay: var(--anim-delay, 0s);
          filter: drop-shadow(0 0 8px rgba(240,230,206,0.4));
        }
        @keyframes lv2-murmurWave {
          0%   { transform: scaleY(var(--scale-min, 0.2)); opacity: 0.75; }
          100% { transform: scaleY(var(--scale-max, 1));   opacity: 1; }
        }

        /* Navbar pill */
        .lv2-pill-cta {
          display: inline-flex;
          align-items: center;
          padding: 9px 22px;
          background: #C8A882;
          color: #2C2419;
          font-family: var(--font-lora), serif;
          font-size: 14px;
          font-weight: 700;
          border-radius: 999px;
          cursor: pointer;
          text-decoration: none;
          transition: background 0.2s ease;
        }
        .lv2-pill-cta:hover { background: #b8936e; }

        /* HERE pill */
        .lv2-pill-here {
          display: inline-flex;
          align-items: center;
          padding: 11px 30px;
          background: #C8A882;
          color: #2C2419;
          font-family: var(--font-lora), serif;
          font-size: 15px;
          font-weight: 800;
          border-radius: 999px;
          cursor: pointer;
          text-decoration: none;
          letter-spacing: 0.06em;
          transition: background 0.2s ease;
        }
        .lv2-pill-here:hover { background: #b8936e; }

        /* Ghost outline button */
        .lv2-ghost {
          display: inline-flex;
          align-items: center;
          padding: 10px 22px;
          background: transparent;
          color: #F9F7F2;
          font-family: var(--font-lora), serif;
          font-size: 13px;
          font-weight: 600;
          border: 1px solid rgba(249,247,242,0.5);
          border-radius: 2px;
          cursor: pointer;
          text-decoration: none;
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        .lv2-ghost:hover {
          border-color: rgba(249,247,242,0.9);
          background: rgba(249,247,242,0.07);
        }

        /* Final CTA */
        .lv2-cta {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 16px 32px;
          background: #C17A47;
          color: #F9F7F2;
          font-family: var(--font-playfair), serif;
          font-size: 18px;
          font-weight: 700;
          border: none;
          border-radius: 2px;
          cursor: pointer;
          text-decoration: none;
          transition: background 0.2s ease, transform 0.15s ease;
        }
        .lv2-cta:hover { background: #a8672f; transform: translateY(-2px); }
        .lv2-cta:active { transform: translateY(0) scale(0.98); }

        /* Mobile */
        @media (max-width: 768px) {
          .landing-v2 nav { padding: 0 20px !important; }
          .lv2-pillars { grid-template-columns: 1fr !important; }
        }

        @media (prefers-reduced-motion: reduce) {
          .landing-v2 * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
          .landing-v2 video { display: none; }
          .landing-v2 .bar { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
