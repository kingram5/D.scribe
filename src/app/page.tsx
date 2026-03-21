import Link from "next/link";
import "./landing.css";
import { MurmurWaveform, CircularText, NavScrollEffect, PaneHoverEffect } from "@/components/landing/LandingClient";

function MicIcon({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="landing-root">
      <NavScrollEffect />
      <PaneHoverEffect />
      <div className="noise-overlay" />

      {/* Nav */}
      <nav id="landing-navbar" className="glass-nav" style={{ position: "fixed", top: 0, width: "100%", zIndex: 50, transition: "all 0.3s" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 48px", height: 80, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "var(--ds-ink)" }}>
            <div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--ds-ink)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <span style={{ fontFamily: "var(--font-lora), serif", fontWeight: 500, fontSize: 20, color: "var(--ds-paper)" }}>D.</span>
            </div>
            <span style={{ fontFamily: "var(--font-manrope), sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>scribe</span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 40 }} className="hidden-mobile">
            <Link href="#" className="nav-link">Platform</Link>
            <Link href="#" className="nav-link">Solutions</Link>
            <Link href="#" className="nav-link">Journal</Link>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Link href="/login" style={{ color: "var(--ds-ink)", fontFamily: "var(--font-manrope), sans-serif", fontWeight: 500, fontSize: 14, textDecoration: "none", transition: "color 0.2s" }}>
              Sign in
            </Link>
            <Link href="/login" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 24px", fontFamily: "var(--font-manrope), sans-serif", fontWeight: 600, fontSize: 14, color: "var(--ds-paper)", background: "var(--ds-ink)", borderRadius: 9999, textDecoration: "none", transition: "transform 0.2s" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                Get Started
                <ArrowIcon />
              </span>
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: 96, overflow: "hidden" }}>
          {/* Pane backgrounds */}
          <div className="pane-container" id="panes">
            <div className="pane" style={{ background: "var(--ds-pane1)" }} />
            <div className="pane" style={{ background: "var(--ds-pane2)" }} />
            <div className="pane" style={{ background: "var(--ds-pane3)" }} />
            <div className="pane" style={{ background: "var(--ds-pane4)" }} />
            <div className="pane" style={{ background: "var(--ds-pane5)" }} />
            <div className="pane" style={{ background: "var(--ds-pane6)" }} />
          </div>

          {/* Ambient glow */}
          <div className="landing-pulse-glow" style={{ position: "absolute", top: "25%", left: "25%", width: "40vw", height: "40vw", background: "rgba(240,113,83,0.05)", borderRadius: "50%", filter: "blur(100px)", mixBlendMode: "multiply", pointerEvents: "none" }} />
          <div className="landing-pulse-glow" style={{ position: "absolute", bottom: "25%", right: "25%", width: "30vw", height: "30vw", background: "rgba(202,138,4,0.05)", borderRadius: "50%", filter: "blur(80px)", mixBlendMode: "multiply", pointerEvents: "none", animationDelay: "-1.5s" }} />

          <div style={{ width: "100%", maxWidth: 1440, margin: "0 auto", padding: "0 48px", position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center" }}>

            {/* Waveform logo */}
            <div id="murmur-stage" style={{ width: "100%", display: "flex", justifyContent: "center", marginBottom: 48, height: 300, alignItems: "center" }}>
              <MurmurWaveform />
            </div>

            {/* Hero text */}
            <div className="landing-slide-up" style={{ maxWidth: 720, margin: "0 auto", textAlign: "center", display: "flex", flexDirection: "column", gap: 32, animationDelay: "0.4s" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "8px 16px", borderRadius: 9999, border: "1px solid rgba(26,24,22,0.1)", background: "rgba(255,255,255,0.5)", backdropFilter: "blur(8px)", alignSelf: "center" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ds-accent-500)", display: "inline-block", animation: "landing-pulseGlow 2s ease-in-out infinite" }} />
                <span style={{ fontSize: 12, fontFamily: "var(--font-manrope), sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(26,24,22,0.7)" }}>v2.0 Editorial Engine Live</span>
              </div>

              <h1 style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em", color: "var(--ds-ink)" }}>
                Dictate the draft.<br />
                <span style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontWeight: 400, color: "rgba(26,24,22,0.6)" }}>Let AI master the manuscript.</span>
              </h1>

              <p style={{ fontSize: 18, color: "rgba(26,24,22,0.7)", lineHeight: 1.7, fontFamily: "var(--font-manrope), sans-serif", maxWidth: 640, margin: "0 auto" }}>
                A workspace designed for verbal thinkers. Speak your ideas loosely, and watch them instantly structure into eloquent, formatted prose ready for publishing.
              </p>

              <div style={{ paddingTop: 24, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 16 }}>
                <Link href="/login" className="cta-primary">
                  <MicIcon size={20} className="" />
                  Start Dictating Free
                </Link>
                <Link href="/login" className="cta-secondary">
                  Explore the Editor
                </Link>
              </div>
            </div>

            {/* Wave decoration */}
            <div className="landing-slide-up wave-container" style={{ width: "100%", maxWidth: 1024, margin: "80px auto 32px", height: 96, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", animationDelay: "0.6s" }}>
              <div className="landing-wave-slow" style={{ position: "absolute", left: 0, display: "flex", width: "200%", opacity: 0.3 }}>
                <svg style={{ width: "50%", height: 64 }} viewBox="0 0 1000 100" preserveAspectRatio="none" fill="none" stroke="var(--ds-ink)" strokeWidth="1">
                  <path d="M0,50 Q125,100 250,50 T500,50 T750,50 T1000,50" />
                </svg>
                <svg style={{ width: "50%", height: 64 }} viewBox="0 0 1000 100" preserveAspectRatio="none" fill="none" stroke="var(--ds-ink)" strokeWidth="1">
                  <path d="M0,50 Q125,100 250,50 T500,50 T750,50 T1000,50" />
                </svg>
              </div>
              <div className="landing-wave-fast" style={{ position: "absolute", left: 0, display: "flex", width: "200%", opacity: 0.5 }}>
                <svg style={{ width: "50%", height: 96 }} viewBox="0 0 1000 100" preserveAspectRatio="none" fill="none" stroke="var(--ds-accent-400)" strokeWidth="2">
                  <path d="M0,50 Q100,0 200,50 T400,50 T600,50 T800,50 T1000,50" />
                </svg>
                <svg style={{ width: "50%", height: 96 }} viewBox="0 0 1000 100" preserveAspectRatio="none" fill="none" stroke="var(--ds-accent-400)" strokeWidth="2">
                  <path d="M0,50 Q100,0 200,50 T400,50 T600,50 T800,50 T1000,50" />
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* Features — dark section */}
        <section style={{ padding: "128px 0", background: "var(--ds-ink)", color: "var(--ds-paper)", position: "relative", borderRadius: "48px 48px 0 0", overflow: "hidden", zIndex: 20, boxShadow: "0 -8px 32px rgba(26,24,22,0.5)" }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 48px" }}>
            <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 96px" }}>
              <h2 style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontSize: "clamp(28px, 5vw, 48px)", marginBottom: 24 }}>The architecture of thought.</h2>
              <p style={{ fontFamily: "var(--font-manrope), sans-serif", color: "rgba(253,252,249,0.7)", fontSize: 18 }}>We built D. scribe to remove the friction between having an idea and seeing it beautifully articulated on the page.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 32, position: "relative" }}>
              {/* Connecting line */}
              <div style={{ display: "none", position: "absolute", top: "50%", left: 0, width: "100%", height: 1, background: "rgba(253,252,249,0.1)", transform: "translateY(-50%)" }} className="hidden-mobile-line" />

              {[
                { num: "01", title: "Unyielding Capture", desc: "Speak freely. Our proprietary models understand context, pacing, and specialized vocabulary, stripping away hesitations while preserving your authentic voice.", stat: "Accuracy Rate", val: "99.8%" },
                { num: "02", title: "Structural Alchemy", desc: "Watch ramblings transform into logical hierarchies. The AI identifies core themes, generates chapter headings, and structures paragraphs for optimal flow.", stat: "Formatting", val: "Automatic", offset: true },
                { num: "03", title: "Typeset & Export", desc: "Bypass the formatting phase. Export pristine manuscripts in standard formats, ready for literary agents, editors, or direct-to-reader publishing platforms.", badges: [".docx", ".epub", ".pdf"] },
              ].map((card) => (
                <div key={card.num} className="feature-card" style={{ transform: card.offset ? "translateY(-12px)" : undefined }}>
                  <div style={{ fontSize: 64, fontFamily: "var(--font-lora), serif", color: "rgba(253,252,249,0.2)", marginBottom: 32, fontWeight: 300, transition: "color 0.2s" }}>{card.num}</div>
                  <h3 style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 24, fontWeight: 700, marginBottom: 16 }}>{card.title}</h3>
                  <p style={{ fontFamily: "var(--font-lora), serif", color: "rgba(253,252,249,0.7)", lineHeight: 1.7 }}>{card.desc}</p>
                  <div style={{ marginTop: 32, paddingTop: 32, borderTop: "1px solid rgba(253,252,249,0.1)" }}>
                    {card.badges ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {card.badges.map((b) => (
                          <span key={b} style={{ padding: "4px 8px", borderRadius: 4, background: "rgba(253,252,249,0.1)", fontSize: 12, fontFamily: "var(--font-manrope), sans-serif", color: "rgba(253,252,249,0.7)" }}>{b}</span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14, fontFamily: "var(--font-manrope), sans-serif", color: "rgba(253,252,249,0.5)" }}>
                        <span>{card.stat}</span>
                        <span style={{ color: "var(--ds-accent-400)", fontWeight: 700 }}>{card.val}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Listening section */}
        <section style={{ padding: "128px 0", background: "var(--ds-surface)", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", borderTop: "1px solid rgba(26,24,22,0.05)", borderRadius: "48px 48px 0 0", marginTop: -32, zIndex: 30 }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 48px", width: "100%", position: "relative", zIndex: 10, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 64 }}>

            <div style={{ flex: "1 1 400px", textAlign: "center", maxWidth: 560 }}>
              <h2 style={{ fontFamily: "var(--font-lora), serif", fontSize: "clamp(28px, 5vw, 48px)", color: "var(--ds-ink)", marginBottom: 24 }}>Always listening. Always learning.</h2>
              <p style={{ fontFamily: "var(--font-manrope), sans-serif", color: "rgba(26,24,22,0.7)", fontSize: 18, lineHeight: 1.7 }}>
                Our intelligent dictation core adapts to your unique cadence, terminology, and stylistic preferences over time, becoming an invisible extension of your creative process.
              </p>
            </div>

            <div style={{ flex: "1 1 400px", position: "relative", display: "flex", justifyContent: "center", alignItems: "center", minHeight: 500 }}>
              <div style={{ position: "absolute", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* Rings */}
                <div style={{ width: 256, height: 256, border: "1px solid rgba(240,113,83,0.3)", borderRadius: "50%", position: "absolute", animation: "landing-pulseGlow 4s ease-in-out infinite" }} />
                <div className="landing-spin-slow" style={{ width: 384, height: 384, border: "1px solid rgba(26,24,22,0.1)", borderRadius: "50%", position: "absolute" }} />
                <div className="landing-spin-slow-reverse" style={{ width: 450, height: 450, border: "1px dashed rgba(26,24,22,0.05)", borderRadius: "50%", position: "absolute" }} />

                {/* Center mic */}
                <div className="landing-pulse-glow" style={{ position: "relative", zIndex: 10, width: 112, height: 112, background: "var(--ds-ink)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 40px rgba(240,113,83,0.2)" }}>
                  <MicIcon size={36} className="" />
                  <style>{`.landing-pulse-glow svg { color: var(--ds-accent-400); }`}</style>
                </div>

                {/* Circular text */}
                <div style={{ position: "absolute" }}>
                  <CircularText />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid rgba(26,24,22,0.1)", background: "var(--ds-paper)", padding: "48px 0", position: "relative", zIndex: 10 }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 48px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "var(--ds-ink)" }}>
            <div style={{ width: 24, height: 24, borderRadius: 4, background: "var(--ds-ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "var(--font-lora), serif", fontSize: 14, color: "var(--ds-paper)" }}>D.</span>
            </div>
            <span style={{ fontFamily: "var(--font-manrope), sans-serif", fontWeight: 700, fontSize: 14 }}>scribe</span>
          </Link>
          <div style={{ fontSize: 12, fontFamily: "var(--font-manrope), sans-serif", color: "rgba(26,24,22,0.4)", textTransform: "uppercase", letterSpacing: "0.15em" }}>
            &copy; 2024 D. scribe. All rights reserved.
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <Link href="#" style={{ color: "rgba(26,24,22,0.5)", fontSize: 12, fontFamily: "var(--font-manrope), sans-serif", textTransform: "uppercase", letterSpacing: "0.15em", textDecoration: "none", transition: "color 0.2s" }}>Privacy</Link>
            <Link href="#" style={{ color: "rgba(26,24,22,0.5)", fontSize: 12, fontFamily: "var(--font-manrope), sans-serif", textTransform: "uppercase", letterSpacing: "0.15em", textDecoration: "none", transition: "color 0.2s" }}>Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
