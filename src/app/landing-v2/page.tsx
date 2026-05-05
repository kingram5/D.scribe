"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CinematicMurmurWaveform, CinematicCircularText } from "@/components/landing/CinematicClient";
import "../cinematic-landing.css";

function MicIcon({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

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
    if (videoRef.current) videoRef.current.playbackRate = 1;
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
        padding: "0 60px", height: 80,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "background 0.3s ease",
        background: scrolled ? "rgba(26,20,14,0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, background: "#C17A47", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 24, color: "#1A140E", marginLeft: 5 }}>D.</div>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#F9F7F2", letterSpacing: "0.05em" }}>scribe</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <Link href="/login" style={{ fontSize: 25, fontWeight: 600, color: "#F9F7F2", textDecoration: "none" }}>Sign in</Link>
          <Link href="/auth/signup" className="lv2-pill-cta">Get Started <span style={{ fontSize: 18 }}>→</span></Link>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section style={{ position: "relative", height: "100vh", zIndex: 1, overflow: "hidden" }}>

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

        {/* Overlay */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundImage: "linear-gradient(to bottom, rgba(26, 20, 14, 0.4), rgba(26, 20, 14, 0.8))", zIndex: 0, pointerEvents: "none" }} />

        {/* Waveform Logo */}
        <div style={{ position: "absolute", top: "18%", left: "50%", transform: "translateX(-50%)", width: "100%", textAlign: "center", zIndex: 2, pointerEvents: "none", height: "30vh" }}>
          <CinematicMurmurWaveform />
        </div>

        {/* Sub-hero CTA */}
        <div style={{ position: "absolute", top: "45%", left: "54%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 24, zIndex: 2 }}>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: 46, color: "#ffffff", opacity: 0.9, marginLeft: -176, marginRight: -7, marginTop: 2 }}>Your Story Starts <span style={{ fontStyle: "normal" }}>→</span></span>
          <Link
            href="/auth/signup"
            style={{ padding: "14px 44px", background: "#C17A47", color: "#1A140E", fontSize: 18, fontWeight: 800, borderRadius: 20, textDecoration: "none", boxShadow: "0 4px 15px rgba(0,0,0,0.3)", marginLeft: 0, marginTop: 10, display: "inline-flex", alignItems: "center" }}
          >
            HERE
          </Link>
        </div>

        {/* Center Tagline */}
        <div style={{ position: "absolute", top: "54%", left: "50%", transform: "translateX(-50%)", textAlign: "center", width: "100%", zIndex: 2 }}>
          <div style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif", fontSize: 57, color: "#F9F7F2", fontWeight: 400, marginBottom: 12, marginTop: -30 }}>You talk. <em style={{ fontStyle: "italic", color: "#dd9f19" }}>It writes.</em></div>
          <div style={{ fontSize: 25, color: "#ffffff", marginBottom: 4, letterSpacing: "0.02em", marginLeft: -1, marginTop: -15 }}>Stop waiting to write your book...</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#bb8f19", letterSpacing: "0.02em" }}>just start talking.</div>
        </div>

        {/* Left Side Author Content */}
        <div style={{ position: "absolute", top: "47%", left: 80, maxWidth: 420, zIndex: 2 }}>
          <h2 style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif", fontSize: "clamp(48px, 6vw, 92px)", fontWeight: 700, lineHeight: 0.95, color: "#F9F7F2", marginBottom: 24, margin: 0, width: 480, marginLeft: -47, marginRight: 0, marginTop: 75 }}>
            There&rsquo;s an<br />Author<br /><span style={{ fontStyle: "italic", fontWeight: 400, color: "#D98B58" }}>Inside You</span>
          </h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: "rgba(249,247,242,0.5)", marginBottom: 20, maxWidth: 320, marginLeft: -50, marginTop: 10, paddingLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, marginRight: 0, width: 500 }}>
            Your recordings, transcribed and shaped into a finished manuscript. You speak — D.&thinsp;scribe writes.
          </p>
          <Link
            href="/auth/signup"
            style={{ display: "inline-flex", alignItems: "center", padding: "8px 29px 10px 7px", background: "#E6C18B", color: "#1A140E", fontSize: 15, lineHeight: "22px", fontWeight: "bold", borderRadius: 4, textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.05em", width: 217.844, height: 50, marginLeft: -50, marginRight: 0, marginTop: -57, marginBottom: 12 }}
          >
            Begin Your Book <span style={{ marginLeft: 12, fontSize: 18 }}>→</span>
          </Link>
        </div>

        {/* Bottom Stats Footer */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "space-around", padding: "40px 80px", paddingLeft: 80, marginTop: -14, background: "linear-gradient(to top, rgba(26, 20, 14, 0.9), transparent)", backdropFilter: "blur(4px)", zIndex: 2 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif", fontSize: 44, fontWeight: 900, color: "#E6C18B", marginBottom: 2, marginLeft: 215, marginTop: 0, marginRight: 1 }}>{"< 10 min"}</div>
            <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.6)", textTransform: "uppercase", letterSpacing: "0.15em", marginLeft: 215 }}>Audio to first chapter</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif", fontSize: 44, fontWeight: 900, color: "#E6C18B", marginBottom: 4, marginTop: 0, marginLeft: -510 }}>6 steps</div>
            <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.6)", textTransform: "uppercase", letterSpacing: "0.15em", marginLeft: -510 }}>From voice to published book</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif", fontSize: 44, fontWeight: 900, color: "#E6C18B", marginBottom: 4, marginLeft: -720, marginTop: 0 }}>Your voice</div>
            <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.6)", textTransform: "uppercase", letterSpacing: "0.15em", marginLeft: -700 }}>AI writes in your style, not its own</div>
          </div>
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
              You bring the ideas. We fill in the gaps.
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

      {/* ─── Written by real people ─── */}
      <FadeSection>
        <section className="py-32 relative z-20">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#1E1810]/60 to-transparent pointer-events-none" />
          <div className="max-w-[1440px] mx-auto px-6 lg:px-12 relative z-10">
            <div className="text-center max-w-3xl mx-auto mb-24">
              <h2 className="italic text-4xl md:text-6xl text-[#F9F7F2] mb-6" style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}>
                Written by real people.
              </h2>
              <p className="text-[#A89F94] text-lg md:text-xl font-light" style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}>
                Everyday voices turned into books that last — stories, wisdom, and expertise finally on the page.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="cinematic-glass-card rounded-2xl p-10 flex flex-col gap-5">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-[#A89F94] mb-3" style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}>Marcus T.</div>
                  <h3 className="text-2xl font-semibold text-[#F9F7F2] leading-snug" style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}>Leading with Clarity</h3>
                </div>
                <div>
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold" style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif", border: "1px solid rgba(193,122,71,0.4)", background: "rgba(193,122,71,0.08)", color: "#C17A47", letterSpacing: "0.04em" }}>Business/Leadership</span>
                </div>
                <p className="text-[#A89F94] leading-relaxed italic flex-1" style={{ fontFamily: "var(--font-lora), var(--font-playfair), serif" }}>
                  &ldquo;I never thought I&apos;d write a book. But after years of leading teams through uncertainty, I realized the lessons I was sharing in meetings deserved a wider audience. D. scribe turned three hours of rambling voice memos into twelve coherent chapters.&rdquo;
                </p>
              </div>
              <div className="cinematic-glass-card rounded-2xl p-10 flex flex-col gap-5 md:-translate-y-12">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-[#A89F94] mb-3" style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}>Pastor Renee J.</div>
                  <h3 className="text-2xl font-semibold text-[#F9F7F2] leading-snug" style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}>Faith in the Everyday</h3>
                </div>
                <div>
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold" style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif", border: "1px solid rgba(193,122,71,0.4)", background: "rgba(193,122,71,0.08)", color: "#C17A47", letterSpacing: "0.04em" }}>Faith Community</span>
                </div>
                <p className="text-[#A89F94] leading-relaxed italic flex-1" style={{ fontFamily: "var(--font-lora), var(--font-playfair), serif" }}>
                  &ldquo;My congregation had been asking me to write down my sermons for years. What I couldn&apos;t have done in a decade, D. scribe helped me accomplish in a weekend. Every word still sounds like me.&rdquo;
                </p>
              </div>
              <div className="cinematic-glass-card rounded-2xl p-10 flex flex-col gap-5">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-[#A89F94] mb-3" style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}>Dr. Sam K.</div>
                  <h3 className="text-2xl font-semibold text-[#F9F7F2] leading-snug" style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}>The Anxiety Playbook</h3>
                </div>
                <div>
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold" style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif", border: "1px solid rgba(193,122,71,0.4)", background: "rgba(193,122,71,0.08)", color: "#C17A47", letterSpacing: "0.04em" }}>Self-Help</span>
                </div>
                <p className="text-[#A89F94] leading-relaxed italic flex-1" style={{ fontFamily: "var(--font-lora), var(--font-playfair), serif" }}>
                  &ldquo;I recorded my thoughts during my morning runs for three months. D. scribe organized them into something I&apos;m genuinely proud of — a practical guide that my patients actually want to read.&rdquo;
                </p>
              </div>
            </div>
            <div className="text-center mt-16">
              <Link href="/discover" className="text-[#A89F94] hover:text-[#C17A47] transition-colors text-base font-medium" style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}>
                Explore all books →
              </Link>
            </div>
          </div>
        </section>
      </FadeSection>

      {/* ─── Always listening. Always learning. ─── */}
      <FadeSection>
        <section id="intelligence" className="py-32 relative flex flex-col items-center justify-center overflow-hidden z-30">
          <div className="absolute inset-0 bg-[#2C2419]/40 backdrop-blur-[2px] z-0" />
          <div className="max-w-7xl mx-auto px-6 lg:px-12 w-full relative z-10 flex flex-col lg:flex-row items-center justify-center gap-16">
            <div className="lg:w-1/2 text-center lg:text-left">
              <h2 className="text-4xl md:text-6xl text-[#F9F7F2] mb-6" style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}>
                Always listening.<br />Always learning.
              </h2>
              <p className="text-[#A89F94] text-lg md:text-xl font-light max-w-lg mx-auto lg:mx-0 leading-relaxed" style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}>
                Upload more recordings and D. scribe maps your vocabulary, sentence rhythms, and rhetorical patterns — so every chapter sounds like you wrote it, not a machine.
              </p>
            </div>
            <div className="lg:w-1/2 relative flex justify-center items-center h-[500px]">
              <div className="absolute inset-0 flex items-center justify-center scale-75 md:scale-100">
                <div className="w-64 h-64 border border-[#C17A47]/30 rounded-full absolute animate-ping" style={{ animationDuration: "4s" }} />
                <div className="w-96 h-96 border border-[rgba(249,247,242,0.1)] rounded-full absolute cinematic-spin-slow" />
                <div className="w-[450px] h-[450px] border border-[rgba(249,247,242,0.2)] border-dashed rounded-full absolute cinematic-spin-slow-reverse" />
                <div className="relative z-10 w-28 h-28 bg-[#3D3428]/40 backdrop-blur-xl border border-[rgba(249,247,242,0.1)] rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(193,122,71,0.3)] cinematic-pulse-glow">
                  <MicIcon size={36} className="text-[#C17A47]" />
                </div>
                <div className="absolute">
                  <CinematicCircularText />
                </div>
              </div>
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
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300..700;1,300..700&display=swap');

        /* Circular text — replicate .cinematic-root scope from cinematic-landing.css */
        .circular-text {
          width: 320px;
          height: 320px;
          position: relative;
          border-radius: 50%;
        }
        .circular-text span {
          position: absolute;
          left: 50%;
          font-size: 13px;
          font-family: var(--font-inter), 'Inter', sans-serif;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.25em;
          color: #F9F7F2;
          opacity: 0.6;
          transform-origin: 0 160px;
        }

        /* Waveform — exact match to main landing cinematic-landing.css */
        .landing-v2 .murmur-svg {
          width: 100%;
          height: auto;
          max-height: 35vh;
          display: block;
          filter: drop-shadow(0 0 6px rgba(240, 168, 120, 1))
                  drop-shadow(0 0 15px rgba(240, 168, 120, 0.85))
                  drop-shadow(0 0 35px rgba(193, 122, 71, 0.7))
                  drop-shadow(0 0 60px rgba(193, 122, 71, 0.5))
                  drop-shadow(0 0 100px rgba(193, 122, 71, 0.3))
                  contrast(1.3) saturate(1.2) brightness(1.1);
          margin: 0 auto;
          will-change: filter;
          transform: translateZ(0);
        }
        .landing-v2 .bar {
          fill: #F0A878;
          transform-box: fill-box;
          transform-origin: center;
          will-change: transform, opacity;
          animation: lv2-murmurWave var(--anim-duration, 2s) cubic-bezier(0.4, 0, 0.2, 1) infinite alternate;
          animation-delay: var(--anim-delay, 0s);
          filter: drop-shadow(0 0 6px rgba(240, 168, 120, 0.75)) brightness(1.15);
        }
        @keyframes lv2-murmurWave {
          0%   { transform: scaleY(var(--scale-min, 0.2)); opacity: 0.95; }
          100% { transform: scaleY(var(--scale-max, 1));   opacity: 1; }
        }

        /* Navbar Get Started pill */
        .lv2-pill-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 32px;
          background: #C17A47;
          color: #1A140E;
          font-size: 20px;
          font-weight: 700;
          border-radius: 999px;
          cursor: pointer;
          text-decoration: none;
          transition: background 0.2s ease;
        }
        .lv2-pill-cta:hover { background: #D98B58; }

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
