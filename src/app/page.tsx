import Link from "next/link";
import "./cinematic-landing.css";
import {
  CinematicMurmurWaveform,
  CinematicCircularText,
  CinematicNavScrollEffect,
  CinematicPaneHoverEffect,
} from "@/components/landing/CinematicClient";

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

export default function CinematicLandingPage() {
  return (
    <div className="cinematic-root relative w-full min-h-screen selection:bg-[#C17A47]/20 selection:text-[#F9F7F2]">
      <CinematicNavScrollEffect />
      <CinematicPaneHoverEffect />

      {/* Video Background */}
      <div className="fixed inset-0 w-full h-full z-0 overflow-hidden" style={{ backgroundColor: "#2C2419", willChange: "transform", transform: "translateZ(0)" }}>
        <video
          className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-95"
          style={{ willChange: "transform", transform: "translate3d(0,0,0)", isolation: "isolate", filter: "contrast(1.08) saturate(1.15)" }}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          poster="/bg-poster.jpg"
          disablePictureInPicture
          disableRemotePlayback
        >
          <source src="/bg-video.webm" type="video/webm" />
          <source src="/bg-video.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-[#2C2419]/5 via-transparent to-[#2C2419]/10 pointer-events-none" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full flex flex-col">

        {/* Nav */}
        <nav
          id="cinematic-navbar"
          className="fixed top-0 w-full z-50 transition-all duration-300 border-b border-transparent"
        >
          <div
            className="max-w-[1440px] mx-auto px-6 lg:px-12 h-24 flex justify-between items-center"
          >
            <Link href="/cinematic" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded bg-[#C17A47] flex items-center justify-center text-white overflow-hidden relative">
                <span
                  className="relative z-10 text-2xl pt-1 group-hover:scale-110 transition-transform duration-300"
                  style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}
                >
                  D.
                </span>
                <div className="absolute inset-0 bg-[#F9F7F2] transform scale-y-0 origin-bottom group-hover:scale-y-100 transition-transform duration-300 ease-out" />
                <span
                  className="absolute inset-0 flex items-center justify-center text-2xl pt-1 text-[#2C2419] opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"
                  style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}
                >
                  D.
                </span>
              </div>
              <span
                className="font-semibold text-lg tracking-tight text-[#F9F7F2]"
                style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
              >
                scribe
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-10">
              <Link href="#features" className="cinematic-nav-link">Features</Link>
              <Link href="#intelligence" className="cinematic-nav-link">Intelligence</Link>
            </div>

            <div className="flex items-center gap-6">
              <Link
                href="/login"
                className="hidden sm:block text-[#A89F94] font-medium text-sm hover:text-[#F9F7F2] transition-colors"
                style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
              >
                Sign in
              </Link>
              <Link
                href="/login"
                className="paper-btn rounded-full px-6 py-2.5 text-sm text-white inline-flex items-center justify-center font-medium gap-2 group"
              >
                Get Started
                <span className="transform group-hover:translate-x-1 transition-transform">
                  <ArrowIcon />
                </span>
              </Link>
            </div>
          </div>
        </nav>

        <main>
          {/* Hero Section */}
          <section className="relative min-h-screen flex flex-col pt-24 pb-20">
            {/* Pane backgrounds */}
            <div className="pane-container" id="cinematic-panes">
              <div className="pane" style={{ backgroundColor: "transparent" }} />
              <div className="pane" style={{ backgroundColor: "transparent" }} />
              <div className="pane" style={{ backgroundColor: "transparent" }} />
              <div className="pane" style={{ backgroundColor: "transparent" }} />
              <div className="pane" style={{ backgroundColor: "transparent" }} />
              <div className="pane" style={{ backgroundColor: "transparent" }} />
            </div>

            {/* Ambient glow */}
            <div
              className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] bg-[#C17A47]/10 rounded-full blur-[120px] mix-blend-screen cinematic-pulse-glow pointer-events-none"
            />
            <div
              className="absolute bottom-1/4 right-1/4 w-[30vw] h-[30vw] bg-[#D98B58]/10 rounded-full blur-[100px] mix-blend-screen cinematic-pulse-glow pointer-events-none"
              style={{ animationDelay: "-1.5s" }}
            />

            <div className="w-full max-w-[1440px] mx-auto px-6 lg:px-12 relative z-10 flex flex-col items-center">
              {/* Waveform */}
              <div
                className="w-full flex justify-center mb-4 sm:mb-6 h-[20vh] md:h-[22vh] items-center"
                id="cinematic-murmur-stage"
              >
                <CinematicMurmurWaveform />
              </div>

              {/* Hero text — "You talk. It writes." */}
              <div
                className="max-w-4xl mx-auto text-center space-y-5 mt-8 cinematic-slide-up"
                style={{ animationDelay: "0.4s" }}
              >
                <h1
                  className="text-4xl md:text-5xl lg:text-6xl text-[#F9F7F2] leading-[1.15] tracking-tight"
                  style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}
                >
                  You talk. <span className="text-[#C17A47] italic">It writes.</span>
                </h1>

                <p
                  className="text-lg md:text-xl lg:text-2xl text-[#A89F94] leading-relaxed max-w-2xl mx-auto"
                  style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                >
                  Stop waiting to write your book...<br />
                  <span className="text-[#F9F7F2] font-medium">just start talking.</span>
                </p>

                <div className="pt-8 flex flex-col items-center gap-5">
                  {/* "Your Story Starts →" plain text */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontFamily: "var(--font-playfair), var(--font-lora), serif",
                    fontSize: "clamp(20px, 2.5vw, 28px)",
                    fontStyle: "italic",
                    color: "#A89F94",
                  }}>
                    Your Story Starts
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </div>

                  {/* "HERE" clickable button */}
                  <Link
                    href="/login"
                    className="paper-btn group"
                    style={{
                      fontFamily: "var(--font-manrope), sans-serif",
                      fontSize: 22,
                      fontWeight: 800,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase" as const,
                      padding: "18px 56px",
                      borderRadius: 9999,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 12,
                      textDecoration: "none",
                      color: "#F9F7F2",
                    }}
                  >
                    HERE
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-1 transition-transform">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </Link>
                </div>
              </div>

            </div>
          </section>

          {/* Features — "Architecture of thought" */}
          <section id="features" className="py-32 relative z-20">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#2C2419]/50 to-transparent pointer-events-none" />

            <div className="max-w-[1440px] mx-auto px-6 lg:px-12 relative z-10">
              <div className="text-center max-w-3xl mx-auto mb-24">
                <h2
                  className="italic text-4xl md:text-6xl text-[#F9F7F2] mb-6"
                  style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}
                >
                  The architecture of thought.
                </h2>
                <p
                  className="text-[#A89F94] text-lg md:text-xl font-light"
                  style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                >
                  We built D. scribe to remove the friction between having an idea and seeing it
                  beautifully articulated on the page.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
                {/* Connecting line */}
                <div className="hidden md:block absolute top-1/2 left-0 w-full h-px bg-[rgba(249,247,242,0.1)] -translate-y-1/2" />

                {/* Card 01 */}
                <div className="group cinematic-glass-card rounded-2xl p-10 hover:bg-[#F4F1E8] transition-colors relative z-10">
                  <div
                    className="text-6xl text-[rgba(168,159,148,0.7)] mb-8 font-light group-hover:text-[#C17A47] transition-colors"
                    style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}
                  >
                    01
                  </div>
                  <h3
                    className="text-2xl font-semibold mb-4 text-[#F9F7F2] group-hover:text-[#2C2419] transition-colors"
                    style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                  >
                    Unyielding Capture
                  </h3>
                  <p
                    className="font-light text-[#A89F94] group-hover:text-[#2C2419]/70 leading-relaxed transition-colors"
                    style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                  >
                    Speak freely. Our proprietary models understand context, pacing, and
                    specialized vocabulary, stripping away hesitations while preserving your
                    authentic voice.
                  </p>
                  <div className="mt-8 pt-8 border-t border-[rgba(249,247,242,0.12)] group-hover:border-[#2C2419]/10 transition-colors">
                    <div
                      className="flex items-center justify-between text-sm text-[#A89F94] group-hover:text-[#2C2419]/60 transition-colors"
                      style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                    >
                      <span>Accuracy Rate</span>
                      <span className="text-[#C17A47] font-semibold">99.8%</span>
                    </div>
                  </div>
                </div>

                {/* Card 02 */}
                <div className="group cinematic-glass-card rounded-2xl p-10 hover:bg-[#F4F1E8] transition-colors relative z-10 md:-translate-y-12">
                  <div
                    className="text-6xl text-[rgba(168,159,148,0.7)] mb-8 font-light group-hover:text-[#C17A47] transition-colors"
                    style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}
                  >
                    02
                  </div>
                  <h3
                    className="text-2xl font-semibold mb-4 text-[#F9F7F2] group-hover:text-[#2C2419] transition-colors"
                    style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                  >
                    Structural Alchemy
                  </h3>
                  <p
                    className="font-light text-[#A89F94] group-hover:text-[#2C2419]/70 leading-relaxed transition-colors"
                    style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                  >
                    Watch ramblings transform into logical hierarchies. The AI identifies core
                    themes, generates chapter headings, and structures paragraphs for optimal
                    flow.
                  </p>
                  <div className="mt-8 pt-8 border-t border-[rgba(249,247,242,0.12)] group-hover:border-[#2C2419]/10 transition-colors">
                    <div
                      className="flex items-center justify-between text-sm text-[#A89F94] group-hover:text-[#2C2419]/60 transition-colors"
                      style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                    >
                      <span>Formatting</span>
                      <span className="text-[#C17A47] font-semibold">Automatic</span>
                    </div>
                  </div>
                </div>

                {/* Card 03 */}
                <div className="group cinematic-glass-card rounded-2xl p-10 hover:bg-[#F4F1E8] transition-colors relative z-10">
                  <div
                    className="text-6xl text-[rgba(168,159,148,0.7)] mb-8 font-light group-hover:text-[#C17A47] transition-colors"
                    style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}
                  >
                    03
                  </div>
                  <h3
                    className="text-2xl font-semibold mb-4 text-[#F9F7F2] group-hover:text-[#2C2419] transition-colors"
                    style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                  >
                    Typeset &amp; Export
                  </h3>
                  <p
                    className="font-light text-[#A89F94] group-hover:text-[#2C2419]/70 leading-relaxed transition-colors"
                    style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                  >
                    Bypass the formatting phase. Export pristine manuscripts in standard formats,
                    ready for literary agents, editors, or direct-to-reader publishing platforms.
                  </p>
                  <div className="mt-8 pt-8 border-t border-[rgba(249,247,242,0.12)] group-hover:border-[#2C2419]/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1.5 rounded-md bg-[#3D3428]/40 border border-[rgba(249,247,242,0.12)] text-xs text-[#A89F94] group-hover:bg-[#2C2419]/10 group-hover:border-[#2C2419]/20 group-hover:text-[#2C2419]/70 transition-colors" style={{ fontFamily: "var(--font-inter), sans-serif" }}>.docx</span>
                      <span className="px-3 py-1.5 rounded-md bg-[#3D3428]/40 border border-[rgba(249,247,242,0.12)] text-xs text-[#A89F94] group-hover:bg-[#2C2419]/10 group-hover:border-[#2C2419]/20 group-hover:text-[#2C2419]/70 transition-colors" style={{ fontFamily: "var(--font-inter), sans-serif" }}>.epub</span>
                      <span className="px-3 py-1.5 rounded-md bg-[#3D3428]/40 border border-[rgba(249,247,242,0.12)] text-xs text-[#A89F94] group-hover:bg-[#2C2419]/10 group-hover:border-[#2C2419]/20 group-hover:text-[#2C2419]/70 transition-colors" style={{ fontFamily: "var(--font-inter), sans-serif" }}>.pdf</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Listening Section */}
          <section id="intelligence" className="py-32 relative flex flex-col items-center justify-center overflow-hidden z-30">
            <div className="absolute inset-0 bg-[#2C2419]/40 backdrop-blur-[2px] z-0" />

            <div className="max-w-7xl mx-auto px-6 lg:px-12 w-full relative z-10 flex flex-col lg:flex-row items-center justify-center gap-16">
              <div className="lg:w-1/2 text-center lg:text-left">
                <h2
                  className="text-4xl md:text-6xl text-[#F9F7F2] mb-6"
                  style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}
                >
                  Always listening.<br />Always learning.
                </h2>
                <p
                  className="text-[#A89F94] text-lg md:text-xl font-light max-w-lg mx-auto lg:mx-0 leading-relaxed"
                  style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                >
                  Our intelligent dictation core adapts to your unique cadence, terminology, and
                  stylistic preferences over time, becoming an invisible extension of your
                  creative process.
                </p>
              </div>

              <div className="lg:w-1/2 relative flex justify-center items-center h-full min-h-[500px]">
                <div className="absolute inset-0 flex items-center justify-center scale-75 md:scale-100">
                  {/* Rings */}
                  <div
                    className="w-64 h-64 border border-[#C17A47]/30 rounded-full absolute animate-ping"
                    style={{ animationDuration: "4s" }}
                  />
                  <div className="w-96 h-96 border border-[rgba(249,247,242,0.1)] rounded-full absolute cinematic-spin-slow" />
                  <div className="w-[450px] h-[450px] border border-[rgba(249,247,242,0.2)] border-dashed rounded-full absolute cinematic-spin-slow-reverse" />

                  {/* Center mic */}
                  <div className="relative z-10 w-28 h-28 bg-[#3D3428]/40 backdrop-blur-xl border border-[rgba(249,247,242,0.1)] rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(193,122,71,0.3)] cinematic-pulse-glow">
                    <MicIcon size={36} className="text-[#C17A47]" />
                  </div>

                  {/* Circular text */}
                  <div className="absolute">
                    <CinematicCircularText />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t border-[rgba(249,247,242,0.1)] bg-[#2C2419]/90 backdrop-blur-xl py-12 relative z-10">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-6">
            <Link href="/cinematic" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-[#C17A47] flex items-center justify-center text-white">
                <span
                  className="text-lg pt-1"
                  style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}
                >
                  D.
                </span>
              </div>
              <span
                className="font-semibold text-base text-[#F9F7F2]"
                style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
              >
                scribe
              </span>
            </Link>
            <div
              className="text-xs text-[rgba(168,159,148,0.7)] uppercase tracking-widest font-medium"
              style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
            >
              &copy; 2024 D. scribe. Cinematic Edition.
            </div>
            <div className="flex gap-8">
              <Link
                href="#"
                className="text-[#A89F94] hover:text-[#F9F7F2] text-xs uppercase tracking-widest transition-colors font-medium"
                style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
              >
                Privacy
              </Link>
              <Link
                href="#"
                className="text-[#A89F94] hover:text-[#F9F7F2] text-xs uppercase tracking-widest transition-colors font-medium"
                style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
              >
                Terms
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
