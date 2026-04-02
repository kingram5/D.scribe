import Link from "next/link";
import "./cinematic.css";
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
    <div className="cinematic-root relative w-full min-h-screen selection:bg-white/20 selection:text-white">
      <CinematicNavScrollEffect />
      <CinematicPaneHoverEffect />

      {/* Video Background */}
      <div className="fixed inset-0 w-full h-full z-0 overflow-hidden" style={{ backgroundColor: "#002536" }}>
        <video
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          autoPlay
          loop
          muted
          playsInline
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4"
            type="video/mp4"
          />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-[#002536]/5 via-transparent to-[#002536]/10 pointer-events-none" />
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
              <div className="w-10 h-10 rounded bg-white flex items-center justify-center text-[#002536] overflow-hidden relative">
                <span
                  className="relative z-10 text-2xl pt-1 group-hover:scale-110 transition-transform duration-300"
                  style={{ fontFamily: "var(--font-instrument), var(--font-lora), serif" }}
                >
                  D.
                </span>
                <div className="absolute inset-0 bg-[#E05D3A] transform scale-y-0 origin-bottom group-hover:scale-y-100 transition-transform duration-300 ease-out" />
                <span
                  className="absolute inset-0 flex items-center justify-center text-2xl pt-1 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"
                  style={{ fontFamily: "var(--font-instrument), var(--font-lora), serif" }}
                >
                  D.
                </span>
              </div>
              <span
                className="font-semibold text-lg tracking-tight text-white"
                style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
              >
                scribe
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-10">
              <Link href="#" className="cinematic-nav-link">Platform</Link>
              <Link href="#" className="cinematic-nav-link">Solutions</Link>
              <Link href="#" className="cinematic-nav-link">Journal</Link>
            </div>

            <div className="flex items-center gap-6">
              <Link
                href="/login"
                className="hidden sm:block text-white/80 font-medium text-sm hover:text-white transition-colors"
                style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
              >
                Sign in
              </Link>
              <Link
                href="/login"
                className="liquid-glass rounded-full px-6 py-2.5 text-sm text-white inline-flex items-center justify-center font-medium gap-2 group"
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
          <section className="relative min-h-[200vh] flex flex-col pt-24 pb-20">
            {/* Pane backgrounds */}
            <div className="pane-container" id="cinematic-panes">
              <div className="pane" style={{ backgroundColor: "rgba(255,255,255,0.005)" }} />
              <div className="pane" style={{ backgroundColor: "rgba(255,255,255,0.01)" }} />
              <div className="pane" style={{ backgroundColor: "rgba(255,255,255,0.015)" }} />
              <div className="pane" style={{ backgroundColor: "rgba(255,255,255,0.02)" }} />
              <div className="pane" style={{ backgroundColor: "rgba(255,255,255,0.025)" }} />
              <div className="pane" style={{ backgroundColor: "rgba(255,255,255,0.03)" }} />
            </div>

            {/* Ambient glow */}
            <div
              className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] bg-[#F07153]/10 rounded-full blur-[120px] mix-blend-screen cinematic-pulse-glow pointer-events-none"
            />
            <div
              className="absolute bottom-1/4 right-1/4 w-[30vw] h-[30vw] bg-blue-500/10 rounded-full blur-[100px] mix-blend-screen cinematic-pulse-glow pointer-events-none"
              style={{ animationDelay: "-1.5s" }}
            />

            <div className="w-full max-w-[1440px] mx-auto px-6 lg:px-12 relative z-10 flex flex-col items-center">
              {/* Waveform */}
              <div
                className="w-full flex justify-center mb-4 sm:mb-6 h-[50vh] md:h-[55vh] items-center"
                id="cinematic-murmur-stage"
              >
                <CinematicMurmurWaveform />
              </div>

              {/* Hero text */}
              <div
                className="max-w-4xl mx-auto text-center space-y-4 mt-[60vh] cinematic-slide-up"
                style={{ animationDelay: "0.4s" }}
              >
                <h1
                  className="text-3xl md:text-4xl lg:text-5xl text-[#FFD700] leading-[1.1] tracking-tight"
                  style={{
                    fontFamily: "var(--font-instrument), var(--font-lora), serif",
                    textShadow: "0 0 20px rgba(255, 215, 0, 0.8), 0 0 40px rgba(255, 215, 0, 0.5), 0 0 80px rgba(255, 215, 0, 0.3), 0 0 120px rgba(255, 193, 7, 0.2)",
                  }}
                >
                  Dictate the draft.<br />
                  <span
                    className="text-[#FFC107] italic text-2xl md:text-3xl lg:text-4xl"
                    style={{
                      textShadow: "0 0 20px rgba(255, 193, 7, 0.8), 0 0 40px rgba(255, 193, 7, 0.5), 0 0 80px rgba(255, 193, 7, 0.3), 0 0 120px rgba(255, 215, 0, 0.2)",
                    }}
                  >
                    Let AI master the manuscript.
                  </span>
                </h1>

                <p
                  className="text-sm md:text-base text-white/70 leading-relaxed max-w-xl mx-auto font-light"
                  style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                >
                  A workspace designed for verbal thinkers. Speak your ideas loosely, and watch
                  them instantly structure into eloquent, formatted prose ready for publishing.
                </p>

                <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link
                    href="/login"
                    className="liquid-glass w-full sm:w-auto px-6 py-2.5 rounded-full font-medium text-sm text-white transition-all flex items-center justify-center gap-2 group"
                    style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                  >
                    <MicIcon size={20} className="group-hover:scale-110 transition-transform text-[#F07153]" />
                    Start Dictating Free
                  </Link>
                  <Link
                    href="/login"
                    className="w-full sm:w-auto px-6 py-2.5 bg-transparent text-white rounded-full font-medium text-sm border border-white/20 hover:bg-white/10 backdrop-blur-sm transition-all flex items-center justify-center gap-2"
                    style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                  >
                    Explore the Editor
                  </Link>
                </div>
              </div>

              {/* Wave decoration */}
              <div
                className="w-full max-w-5xl mx-auto mt-24 mb-8 cinematic-slide-up cinematic-wave-container h-24 relative overflow-hidden flex items-center"
                style={{ animationDelay: "0.6s" }}
              >
                <div className="absolute left-0 flex w-[200%] cinematic-wave-slow opacity-30">
                  <svg className="w-1/2 h-16 text-white" viewBox="0 0 1000 100" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="1">
                    <path d="M0,50 Q125,100 250,50 T500,50 T750,50 T1000,50" />
                  </svg>
                  <svg className="w-1/2 h-16 text-white" viewBox="0 0 1000 100" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="1">
                    <path d="M0,50 Q125,100 250,50 T500,50 T750,50 T1000,50" />
                  </svg>
                </div>
                <div className="absolute left-0 flex w-[200%] cinematic-wave-fast opacity-50">
                  <svg className="w-1/2 h-24 text-[#F07153]" viewBox="0 0 1000 100" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M0,50 Q100,0 200,50 T400,50 T600,50 T800,50 T1000,50" />
                  </svg>
                  <svg className="w-1/2 h-24 text-[#F07153]" viewBox="0 0 1000 100" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M0,50 Q100,0 200,50 T400,50 T600,50 T800,50 T1000,50" />
                  </svg>
                </div>
              </div>
            </div>
          </section>

          {/* Features — "Architecture of thought" */}
          <section className="py-32 relative z-20">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#002536]/50 to-transparent pointer-events-none" />

            <div className="max-w-[1440px] mx-auto px-6 lg:px-12 relative z-10">
              <div className="text-center max-w-3xl mx-auto mb-24">
                <h2
                  className="italic text-4xl md:text-6xl text-white mb-6"
                  style={{ fontFamily: "var(--font-instrument), var(--font-lora), serif" }}
                >
                  The architecture of thought.
                </h2>
                <p
                  className="text-white/70 text-lg md:text-xl font-light"
                  style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                >
                  We built D. scribe to remove the friction between having an idea and seeing it
                  beautifully articulated on the page.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
                {/* Connecting line */}
                <div className="hidden md:block absolute top-1/2 left-0 w-full h-px bg-white/10 -translate-y-1/2" />

                {/* Card 01 */}
                <div className="group cinematic-glass-card rounded-2xl p-10 hover:bg-white/[0.04] transition-colors relative z-10">
                  <div
                    className="text-6xl text-white/10 mb-8 font-light group-hover:text-[#E05D3A] transition-colors"
                    style={{ fontFamily: "var(--font-instrument), var(--font-lora), serif" }}
                  >
                    01
                  </div>
                  <h3
                    className="text-2xl font-semibold mb-4 text-white"
                    style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                  >
                    Unyielding Capture
                  </h3>
                  <p
                    className="font-light text-white/70 leading-relaxed"
                    style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                  >
                    Speak freely. Our proprietary models understand context, pacing, and
                    specialized vocabulary, stripping away hesitations while preserving your
                    authentic voice.
                  </p>
                  <div className="mt-8 pt-8 border-t border-white/10">
                    <div
                      className="flex items-center justify-between text-sm text-white/50"
                      style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                    >
                      <span>Accuracy Rate</span>
                      <span className="text-[#F07153] font-semibold">99.8%</span>
                    </div>
                  </div>
                </div>

                {/* Card 02 */}
                <div className="group cinematic-glass-card rounded-2xl p-10 hover:bg-white/[0.04] transition-colors relative z-10 md:-translate-y-12">
                  <div
                    className="text-6xl text-white/10 mb-8 font-light group-hover:text-[#E05D3A] transition-colors"
                    style={{ fontFamily: "var(--font-instrument), var(--font-lora), serif" }}
                  >
                    02
                  </div>
                  <h3
                    className="text-2xl font-semibold mb-4 text-white"
                    style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                  >
                    Structural Alchemy
                  </h3>
                  <p
                    className="font-light text-white/70 leading-relaxed"
                    style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                  >
                    Watch ramblings transform into logical hierarchies. The AI identifies core
                    themes, generates chapter headings, and structures paragraphs for optimal
                    flow.
                  </p>
                  <div className="mt-8 pt-8 border-t border-white/10">
                    <div
                      className="flex items-center justify-between text-sm text-white/50"
                      style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                    >
                      <span>Formatting</span>
                      <span className="text-[#F07153] font-semibold">Automatic</span>
                    </div>
                  </div>
                </div>

                {/* Card 03 */}
                <div className="group cinematic-glass-card rounded-2xl p-10 hover:bg-white/[0.04] transition-colors relative z-10">
                  <div
                    className="text-6xl text-white/10 mb-8 font-light group-hover:text-[#E05D3A] transition-colors"
                    style={{ fontFamily: "var(--font-instrument), var(--font-lora), serif" }}
                  >
                    03
                  </div>
                  <h3
                    className="text-2xl font-semibold mb-4 text-white"
                    style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                  >
                    Typeset &amp; Export
                  </h3>
                  <p
                    className="font-light text-white/70 leading-relaxed"
                    style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
                  >
                    Bypass the formatting phase. Export pristine manuscripts in standard formats,
                    ready for literary agents, editors, or direct-to-reader publishing platforms.
                  </p>
                  <div className="mt-8 pt-8 border-t border-white/10">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs text-white/70" style={{ fontFamily: "var(--font-inter), sans-serif" }}>.docx</span>
                      <span className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs text-white/70" style={{ fontFamily: "var(--font-inter), sans-serif" }}>.epub</span>
                      <span className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs text-white/70" style={{ fontFamily: "var(--font-inter), sans-serif" }}>.pdf</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Listening Section */}
          <section className="py-32 relative flex flex-col items-center justify-center overflow-hidden z-30">
            <div className="absolute inset-0 bg-[#002536]/40 backdrop-blur-[2px] z-0" />

            <div className="max-w-7xl mx-auto px-6 lg:px-12 w-full relative z-10 flex flex-col lg:flex-row items-center justify-center gap-16">
              <div className="lg:w-1/2 text-center lg:text-left">
                <h2
                  className="text-4xl md:text-6xl text-white mb-6"
                  style={{ fontFamily: "var(--font-instrument), var(--font-lora), serif" }}
                >
                  Always listening.<br />Always learning.
                </h2>
                <p
                  className="text-white/70 text-lg md:text-xl font-light max-w-lg mx-auto lg:mx-0 leading-relaxed"
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
                    className="w-64 h-64 border border-[#E05D3A]/40 rounded-full absolute animate-ping"
                    style={{ animationDuration: "4s" }}
                  />
                  <div className="w-96 h-96 border border-white/10 rounded-full absolute cinematic-spin-slow" />
                  <div className="w-[450px] h-[450px] border border-white/20 border-dashed rounded-full absolute cinematic-spin-slow-reverse" />

                  {/* Center mic */}
                  <div className="relative z-10 w-28 h-28 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(240,113,83,0.3)] cinematic-pulse-glow">
                    <MicIcon size={36} className="text-[#F07153]" />
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
        <footer className="border-t border-white/10 bg-[#002536]/80 backdrop-blur-xl py-12 relative z-10">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-6">
            <Link href="/cinematic" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-white flex items-center justify-center text-[#002536]">
                <span
                  className="text-lg pt-1"
                  style={{ fontFamily: "var(--font-instrument), var(--font-lora), serif" }}
                >
                  D.
                </span>
              </div>
              <span
                className="font-semibold text-base text-white"
                style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
              >
                scribe
              </span>
            </Link>
            <div
              className="text-xs text-white/40 uppercase tracking-widest font-medium"
              style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
            >
              &copy; 2024 D. scribe. Cinematic Edition.
            </div>
            <div className="flex gap-8">
              <Link
                href="#"
                className="text-white/50 hover:text-white text-xs uppercase tracking-widest transition-colors font-medium"
                style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}
              >
                Privacy
              </Link>
              <Link
                href="#"
                className="text-white/50 hover:text-white text-xs uppercase tracking-widest transition-colors font-medium"
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
