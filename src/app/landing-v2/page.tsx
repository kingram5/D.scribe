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
  { num: "03", title: "Structure", desc: "Set your chapter count, word targets, and tone. The blueprint for your book, built before a word is written." },
  { num: "04", title: "Analyze", desc: "Key themes extracted, voice profile built, narrative arcs identified. Your ideas, mapped." },
  { num: "05", title: "Generate", desc: "AI writes your manuscript chapter by chapter — in your voice, not a robot's." },
  { num: "06", title: "Edit", desc: "Review every sentence in a full manuscript editor. Refine, rewrite, and make it yours." },
  { num: "07", title: "Export", desc: "Download your finished book as PDF or DOCX. Print-ready. Publisher-ready. Yours." },
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

// Paper-theme colors — matches the actual D.scribe app
const P = {
  paper:       "#FAF8F3",
  cardBg:      "#F5F1EA",
  cardBorder:  "rgba(0,0,0,0.07)",
  inputBg:     "#EFEBE4",
  textPrimary: "#191816",
  textSec:     "#7a7369",
  textTert:    "rgba(0,0,0,0.28)",
  accent:      "#C17A47",
};

const DASH_PIPELINE = [
  { key: "upload",     label: "Audio Upload",       desc: "Upload your recording or paste a YouTube link" },
  { key: "transcribe", label: "Transcription",      desc: "Your words, captured and ready to shape" },
  { key: "structure",  label: "Structure Setup",    desc: "Set chapters and word targets" },
  { key: "analyze",    label: "Content Analysis",   desc: "AI identifies themes, voice patterns, and narrative arcs" },
  { key: "generate",   label: "Chapter Generation", desc: "AI writes your manuscript, chapter by chapter" },
  { key: "editor",     label: "Manuscript Editor",  desc: "Review, refine, and polish your manuscript" },
  { key: "export",     label: "Export & Publish",   desc: "Download your finished book in any format" },
];

function DashStepAnim({ stepKey }: { stepKey: string }) {
  const wrap: React.CSSProperties = {
    width: "100%", flex: 1, minHeight: 160, borderRadius: 12, position: "relative",
    overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
    border: `1px solid ${P.cardBorder}`, background: P.cardBg,
  };
  switch (stepKey) {
    case "upload": return (
      <div style={wrap}>
        <style>{`@keyframes dsa-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}@keyframes dsa-pulse-ring{0%{transform:translate(-50%,-50%) scale(1);opacity:.3}100%{transform:translate(-50%,-50%) scale(3.2);opacity:0}}`}</style>
        <div style={{ position: "relative", width: 180, height: 180, borderRadius: 32, border: `2px dashed rgba(193,122,71,0.35)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", width: 64, height: 64, borderRadius: "50%", background: P.accent, animation: "dsa-pulse-ring 2s infinite" }} />
          <div style={{ position: "absolute", top: "50%", left: "50%", width: 64, height: 64, borderRadius: "50%", background: P.accent, animation: "dsa-pulse-ring 2s infinite 1s" }} />
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={P.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "relative", zIndex: 2, animation: "dsa-float 3s infinite" }}>
            <rect x="9" y="1" width="6" height="12" rx="3" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </div>
      </div>
    );
    case "transcribe": return (
      <div style={wrap}>
        <style>{`@keyframes dsa-wave{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}@keyframes dsa-particle{0%{left:0}100%{left:calc(100% - 5px)}}@keyframes dsa-line-fill{0%,40%{opacity:.1}60%,100%{opacity:.8}}`}</style>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 24px", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 3, height: 80 }}>
            {[30, 60, 100, 50, 75].map((h, i) => (
              <div key={i} style={{ width: 6, height: `${h}%`, background: P.accent, borderRadius: 2, transformOrigin: "center", animation: `dsa-wave 1.2s ease-in-out infinite ${i * 0.15}s` }} />
            ))}
          </div>
          <div style={{ flex: 1, position: "relative", height: 1, backgroundImage: `repeating-linear-gradient(90deg, rgba(193,122,71,0.3), rgba(193,122,71,0.3) 4px, transparent 4px, transparent 8px)` }}>
            <div style={{ position: "absolute", top: -4, width: 10, height: 10, borderRadius: "50%", background: P.accent, animation: "dsa-particle 2s linear infinite" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 80 }}>
            {[100, 80, 90, 60].map((w, i) => (
              <div key={i} style={{ width: `${w}%`, height: 3, borderRadius: 2, background: "rgba(193,122,71,0.25)", animation: `dsa-line-fill 2s ease-in-out infinite ${i * 0.3}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
    case "structure": return (
      <div style={wrap}>
        <style>{`@keyframes dsa-chap-pop{0%,10%{transform:scale(0);opacity:0}20%,85%{transform:scale(1);opacity:1}95%,100%{transform:scale(.8);opacity:0}}@keyframes dsa-bar-grow{0%,30%{transform:scaleY(0)}50%,85%{transform:scaleY(1)}95%,100%{transform:scaleY(0)}}@keyframes dsa-word-fill{0%,20%{width:0}50%,85%{width:75%}100%{width:0}}@keyframes dsa-count-up{0%,20%{opacity:0;transform:translateY(8px)}40%,85%{opacity:1;transform:translateY(0)}95%,100%{opacity:0}}`}</style>
        <div style={{ display: "flex", gap: 24, padding: "16px 20px", width: "100%", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 18, textTransform: "uppercase", letterSpacing: "0.1em", color: P.accent, fontFamily: "var(--font-manrope), sans-serif", fontWeight: 500 }}>Chapters</span>
            {[1, 2, 3].map((n, i) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: P.accent, color: P.paper, fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, animation: `dsa-chap-pop 4s infinite ${i * 0.6}s`, fontFamily: "var(--font-manrope), sans-serif" }}>{n}</div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 18, textTransform: "uppercase", letterSpacing: "0.1em", color: P.accent, fontFamily: "var(--font-manrope), sans-serif", fontWeight: 500 }}>Target Words</span>
            <div style={{ position: "relative", height: 10, background: "rgba(193,122,71,0.1)", borderRadius: 5, overflow: "hidden", marginTop: 8, marginBottom: 8 }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 0, background: `linear-gradient(90deg, ${P.accent}, #D98B58)`, borderRadius: 5, animation: "dsa-word-fill 4s infinite ease-out" }} />
            </div>
            <div style={{ fontSize: 36, color: P.textPrimary, fontWeight: 600, animation: "dsa-count-up 4s infinite", fontFamily: "var(--font-manrope), sans-serif" }}>45,000</div>
            <div style={{ display: "flex", gap: 3, height: 40, alignItems: "flex-end", marginTop: 12 }}>
              {[60, 85, 70, 40, 30, 20].map((h, i) => (
                <div key={i} style={{ flex: 1, background: i < 3 ? P.accent : P.textSec, borderRadius: "2px 2px 0 0", height: `${h}%`, animation: `dsa-bar-grow 4s infinite ${0.2 + i * 0.3}s`, transformOrigin: "bottom", opacity: i < 3 ? 0.7 : 0.35 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
    case "analyze": return (
      <div style={wrap}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 30%, rgba(193,122,71,0.08) 0%, transparent 60%)" }} />
        <svg width="100%" height="100%" viewBox="0 0 300 200" style={{ position: "relative", zIndex: 1 }} preserveAspectRatio="xMidYMid slice">
          <circle cx="150" cy="100" r="50" fill="none" stroke="rgba(193,122,71,0.15)" strokeWidth="1">
            <animate attributeName="r" values="50;58;50" dur="4s" repeatCount="indefinite" />
          </circle>
          <circle cx="150" cy="100" r="14" fill={P.accent} opacity="0.9">
            <animate attributeName="r" values="11;13;11" dur="2s" repeatCount="indefinite" />
          </circle>
          <g opacity="0.8">
            <circle cx="150" cy="50" r="6" fill={P.accent}>
              <animateTransform attributeName="transform" type="rotate" from="0 150 100" to="360 150 100" dur="12s" repeatCount="indefinite" />
            </circle>
          </g>
          <g opacity="0.7">
            <circle cx="220" cy="100" r="5" fill="#D98B58">
              <animateTransform attributeName="transform" type="rotate" from="45 150 100" to="405 150 100" dur="18s" repeatCount="indefinite" />
            </circle>
          </g>
          <g opacity="0.9">
            <circle cx="150" cy="165" r="7" fill={P.accent}>
              <animateTransform attributeName="transform" type="rotate" from="120 150 100" to="480 150 100" dur="15s" repeatCount="indefinite" />
            </circle>
          </g>
          <path d="M80 70 L190 55 L210 150 L90 165 Z" stroke={P.accent} strokeWidth="0.5" fill="none" opacity="0.15">
            <animate attributeName="opacity" values="0.08;0.22;0.08" dur="6s" repeatCount="indefinite" />
          </path>
        </svg>
        <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
          <span style={{ background: P.cardBg, backdropFilter: "blur(8px)", padding: "4px 12px", borderRadius: 9999, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 500, color: P.accent, border: `1px solid ${P.cardBorder}`, fontFamily: "var(--font-manrope), sans-serif" }}>Processing Patterns</span>
        </div>
      </div>
    );
    case "generate": return (
      <div style={wrap}>
        <style>{`@keyframes dsa-type{0%{width:0%}80%,100%{width:var(--dsa-mw)}}@keyframes dsa-blink{0%,49%{opacity:1}50%,100%{opacity:0}}`}</style>
        <div style={{ position: "relative", width: 180, height: 220, borderRadius: "6px 18px 6px 6px", background: P.cardBg, border: `1px solid ${P.cardBorder}`, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, right: 0, width: 22, height: 22, background: `linear-gradient(135deg, ${P.paper} 50%, rgba(193,122,71,0.15) 50%)` }} />
          <div style={{ padding: "28px 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            {[{ maxW: "85%", d: "0s" }, { maxW: "70%", d: "1.5s" }, { maxW: "90%", d: "3s" }, { maxW: "60%", d: "4.5s" }].map((l, i) => (
              <div key={i} style={{ position: "relative", height: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, background: "rgba(193,122,71,0.25)", ["--dsa-mw" as string]: l.maxW, width: 0, animation: `dsa-type 6s steps(20) infinite ${l.d}` }} />
                <div style={{ position: "absolute", right: 0, top: 0, width: 2, height: "100%", background: P.accent, animation: "dsa-blink 0.6s step-end infinite" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
    case "editor": return (
      <div style={wrap}>
        <style>{`
          .dsa-doc{width:220px;height:220px;background:${P.cardBg};border-radius:6px;box-shadow:3px 6px 16px rgba(0,0,0,0.1);padding:20px 18px;display:flex;flex-direction:column;gap:18px;position:relative;overflow:hidden;border:1px solid ${P.cardBorder}}
          .dsa-doc::before{content:'';position:absolute;top:0;left:0;width:4px;height:100%;background:rgba(193,122,71,0.18)}
          .dsa-el{height:9px;background:${P.accent};border-radius:3px;opacity:.25;position:relative}
          .dsa-strike{position:absolute;top:50%;left:-5%;width:0;height:3px;background:${P.textSec};border-radius:2px}
          .dsa-cur{position:absolute;width:3px;height:24px;background:${P.accent};border-radius:2px;opacity:0;z-index:20}
          .dsa-el1 .dsa-strike{animation:dsa-strike-l 5s infinite}
          .dsa-el1{animation:dsa-fade-out 5s infinite}
          .dsa-el2 .dsa-cur{top:-3px;animation:dsa-cur-edit 5s infinite 1s}
          .dsa-el2{animation:dsa-shrink 5s infinite 1s}
          .dsa-el3{animation:dsa-shift 5s infinite 2s}
          .dsa-el4{animation:dsa-appear 5s infinite 3s}
          @keyframes dsa-strike-l{0%,20%{width:0}30%,100%{width:110%}}
          @keyframes dsa-fade-out{0%,30%{opacity:.25;transform:translateX(0)}50%{opacity:.06;transform:translateX(4px)}80%,100%{opacity:.25;transform:translateX(0)}}
          @keyframes dsa-cur-edit{0%,10%{opacity:1;left:0}20%{opacity:1;left:40%}30%{opacity:0;left:40%}100%{opacity:0;left:0}}
          @keyframes dsa-shrink{0%,15%{width:85%}35%,75%{width:55%}95%,100%{width:85%}}
          @keyframes dsa-shift{0%,15%{transform:translateY(0)}35%,75%{transform:translateY(10px);opacity:.15}95%,100%{transform:translateY(0)}}
          @keyframes dsa-appear{0%,15%{opacity:0;transform:scaleX(.8) translateX(-8px)}35%,75%{opacity:.25;transform:scaleX(1) translateX(0)}95%,100%{opacity:0}}
        `}</style>
        <div className="dsa-doc">
          <div className="dsa-el dsa-el1" style={{ width: "100%" }}><div className="dsa-strike" /></div>
          <div className="dsa-el dsa-el2" style={{ width: "85%" }}><div className="dsa-cur" /></div>
          <div className="dsa-el dsa-el3" style={{ width: "75%" }} />
          <div className="dsa-el dsa-el4" style={{ width: "80%" }} />
          <div className="dsa-el" style={{ width: "90%", opacity: 0.12 }} />
          <div className="dsa-el" style={{ width: "60%", opacity: 0.08 }} />
        </div>
        <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, textAlign: "center" }}>
          <span style={{ background: P.cardBg, backdropFilter: "blur(8px)", padding: "4px 12px", borderRadius: 9999, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 500, color: P.accent, border: `1px solid ${P.cardBorder}`, fontFamily: "var(--font-manrope), sans-serif" }}>Refining Prose</span>
        </div>
      </div>
    );
    case "export": return (
      <div style={wrap}>
        <style>{`@keyframes dsa-book-float{0%,100%{transform:translateY(0) rotateY(0deg)}50%{transform:translateY(-8px) rotateY(3deg)}}@keyframes dsa-shine{0%{left:-60%}100%{left:120%}}@keyframes dsa-rise{0%{transform:translateY(0);opacity:.7}100%{transform:translateY(-60px);opacity:0}}`}</style>
        <div style={{ position: "relative" }}>
          <div style={{ width: 160, height: 220, borderRadius: "3px 12px 12px 3px", background: `linear-gradient(135deg, ${P.accent}, #8B5A2B)`, position: "relative", overflow: "hidden", animation: "dsa-book-float 4s ease-in-out infinite", boxShadow: "6px 6px 28px rgba(0,0,0,0.2)" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: "linear-gradient(180deg, rgba(249,247,242,0.15), rgba(249,247,242,0.04))" }} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 70, height: 70, borderRadius: "50%", border: "2px solid rgba(249,247,242,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 22, height: 2, background: "rgba(249,247,242,0.4)", borderRadius: 2 }} />
            </div>
            <div style={{ position: "absolute", top: 0, bottom: 0, width: "40%", background: "linear-gradient(90deg, transparent, rgba(249,247,242,0.1), transparent)", animation: "dsa-shine 4s ease-in-out infinite" }} />
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ position: "absolute", bottom: -10, left: 24 + i * 40, width: 8, height: 8, borderRadius: "50%", background: P.accent, animation: `dsa-rise 2s ease-out infinite ${i * 0.6}s` }} />
          ))}
        </div>
      </div>
    );
    default: return <div style={wrap} />;
  }
}

function PipelineDashboard() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive(p => (p + 1) % DASH_PIPELINE.length), 2600);
    return () => clearInterval(t);
  }, []);

  const step = DASH_PIPELINE[active];

  return (
    <div style={{
      borderRadius: 20,
      overflow: "hidden",
      boxShadow: "0 40px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.18)",
      display: "flex",
      height: 1122,
    }}>
      {/* ── Left panel: timeline ── */}
      <div style={{
        width: "40%",
        background: P.paper,
        padding: "22px 20px",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}>
        {/* Back button */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, color: P.textSec, fontSize: 20, fontFamily: "var(--font-manrope), sans-serif", cursor: "default" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          Dashboard
        </div>

        {/* Project title */}
        <div style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 16, textTransform: "uppercase", letterSpacing: "0.2em", color: P.textSec, display: "block", marginBottom: 6, fontFamily: "var(--font-manrope), sans-serif" }}>Book Project</span>
          <div style={{ fontFamily: "var(--font-playfair), serif", fontSize: 36, lineHeight: 1.15, color: P.textPrimary }}>Leading With<br />Clarity</div>
        </div>

        {/* Timeline */}
        <div style={{ position: "relative", marginLeft: 4 }}>
          {DASH_PIPELINE.map((s, i) => {
            const isDone   = i < active;
            const isActive = i === active;
            const isLast   = i === DASH_PIPELINE.length - 1;
            return (
              <div key={s.key} style={{ position: "relative", paddingLeft: 32, marginBottom: isLast ? 0 : 20 }}>
                {/* Connector line */}
                {!isLast && (
                  <div style={{ position: "absolute", left: 7, top: 18, bottom: -4, width: 1, background: isDone ? "rgba(193,122,71,0.3)" : P.cardBorder, transition: "background 0.4s" }} />
                )}
                {/* Dot */}
                <div style={{
                  position: "absolute",
                  left: isActive ? -2 : 0,
                  top: isActive ? -1 : 2,
                  width: isActive ? 20 : 15,
                  height: isActive ? 20 : 15,
                  borderRadius: "50%",
                  background: isActive ? P.accent : P.paper,
                  border: isActive ? `3px solid ${P.paper}` : isDone ? `1px solid ${P.textSec}` : `1px solid ${P.cardBorder}`,
                  boxShadow: isActive ? `0 0 0 1px ${P.accent}` : "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.3s", zIndex: 2,
                }}>
                  {isDone && (
                    <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke={P.textSec} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                {/* Label */}
                {isActive ? (
                  <div style={{ marginLeft: -2, padding: "8px 10px", borderRadius: 10, background: P.cardBg, border: `1px solid ${P.cardBorder}`, transition: "all 0.3s" }}>
                    <span style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, color: P.accent, display: "block", marginBottom: 3, fontFamily: "var(--font-manrope), sans-serif" }}>Current Stage</span>
                    <span style={{ fontFamily: "var(--font-playfair), serif", fontSize: 26, color: P.textPrimary }}>{s.label}</span>
                  </div>
                ) : (
                  <span style={{ fontSize: 22, color: isDone ? P.textSec : P.textTert, display: "block", marginTop: 1, fontFamily: "var(--font-manrope), sans-serif", transition: "color 0.3s" }}>
                    {s.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right panel: detail card ── */}
      <div style={{ flex: 1, background: P.inputBg, borderLeft: `1px solid ${P.cardBorder}`, padding: "10px 12px", display: "flex", flexDirection: "column" }}>
        <div style={{ background: P.cardBg, borderRadius: 22, padding: "18px 20px", border: `1px solid ${P.cardBorder}`, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Progress dots + step counter */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {DASH_PIPELINE.map((_, i) => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: i <= active ? P.accent : "transparent",
                  border: i <= active ? "none" : `1px solid rgba(0,0,0,0.15)`,
                  opacity: i < active ? 0.7 : 1,
                  transition: "all 0.4s",
                }} />
              ))}
            </div>
            <span style={{ fontSize: 16, textTransform: "uppercase", letterSpacing: "0.15em", color: P.accent, fontWeight: 600, fontFamily: "var(--font-manrope), sans-serif" }}>
              Step {active + 1} of {DASH_PIPELINE.length}
            </span>
          </div>

          {/* Step title + desc */}
          <div style={{ marginBottom: 12, flexShrink: 0 }}>
            <div style={{ fontFamily: "var(--font-playfair), serif", fontSize: 40, color: P.textPrimary, marginBottom: 5, transition: "all 0.3s" }}>
              {step.label}
            </div>
            <p style={{ fontSize: 22, color: P.textSec, lineHeight: 1.5, fontFamily: "var(--font-manrope), sans-serif" }}>
              {step.desc}
            </p>
          </div>

          {/* Step animation */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <DashStepAnim stepKey={step.key} />
          </div>

          {/* Footer metadata */}
          <div style={{ borderTop: `1px solid ${P.cardBorder}`, paddingTop: 10, marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 16 }}>
              {[{ l: "Audience", v: "General" }, { l: "Words", v: "12,450" }, { l: "Chapters", v: "3 / 7" }].map(m => (
                <div key={m.l}>
                  <span style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.1em", color: P.textSec, display: "block", marginBottom: 2, fontFamily: "var(--font-manrope), sans-serif" }}>{m.l}</span>
                  <span style={{ fontSize: 20, fontWeight: 500, color: P.textPrimary, fontFamily: "var(--font-manrope), sans-serif" }}>{m.v}</span>
                </div>
              ))}
            </div>
            <div style={{ background: P.accent, color: P.paper, padding: "6px 12px", borderRadius: 9999, fontSize: 20, fontWeight: 500, cursor: "default", fontFamily: "var(--font-manrope), sans-serif", display: "flex", alignItems: "center", gap: 5 }}>
              View Details
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brainstorm chat mock — animated replica of the real BrainstormChat UI
// ---------------------------------------------------------------------------

const BS_SCRIPT = [
  { role: "user", text: "I want to write a book about building my business from zero to a million dollars" },
  { role: "ai",   text: "That's a powerful story. What was the single moment you knew it was actually going to work?" },
  { role: "user", text: "When our first corporate client signed — a six-figure contract. I just sat in my car and cried" },
  { role: "ai",   text: "What had you given up to get to that moment? What did that contract really mean?" },
  { role: "user", text: "Everything. I hadn't paid myself in eight months. My wife believed in me more than I did" },
  { role: "ai",   text: "That's the heart of the book right there. Who do you most want to read this story?" },
] as const;

function BrainstormMock() {
  const [displayed, setDisplayed] = useState<{ role: string; text: string }[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [typingRole, setTypingRole] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [scriptIdx, setScriptIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function sleep(ms: number) {
      return new Promise<void>(r => setTimeout(r, ms));
    }

    async function typeMessage(text: string, role: string) {
      if (cancelled) return;
      setTypingRole(role);
      setCurrentText("");
      for (let i = 0; i <= text.length; i++) {
        if (cancelled) return;
        setCurrentText(text.slice(0, i));
        await sleep(28);
      }
      if (cancelled) return;
      setDisplayed(prev => [...prev, { role, text }]);
      setCurrentText("");
      setTypingRole(null);
    }

    async function run() {
      await sleep(600);
      for (let i = scriptIdx; i < BS_SCRIPT.length; i++) {
        if (cancelled) return;
        const entry = BS_SCRIPT[i];
        if (entry.role === "ai") {
          setThinking(true);
          await sleep(1300);
          if (cancelled) return;
          setThinking(false);
        }
        await typeMessage(entry.text, entry.role);
        if (cancelled) return;
        setScriptIdx(i + 1);
        await sleep(700);
      }
      // loop: fade out then restart
      if (cancelled) return;
      setFading(true);
      await sleep(800);
      if (cancelled) return;
      setDisplayed([]);
      setScriptIdx(0);
      setFading(false);
      await sleep(500);
      if (!cancelled) run();
    }

    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [displayed, currentText, thinking]);

  const accent = "#C17A47";
  const paper  = "#FAF8F3";
  const cardBg = "#F5F1EA";
  const border = "rgba(0,0,0,0.07)";
  const ink    = "#191816";

  return (
    <div style={{
      background: paper,
      borderRadius: 20,
      boxShadow: "0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)",
      display: "flex",
      flexDirection: "column",
      height: 650,
      width: 840,
      overflow: "hidden",
      opacity: fading ? 0 : 1,
      transition: "opacity 0.6s ease",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 18px",
        borderBottom: `1px solid ${border}`,
        width: 840,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: ink }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 2L4 7l5 5" />
          </svg>
          <span style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 13, fontWeight: 600, color: ink }}>
            Brainstorm Session
          </span>
        </div>
        <div style={{
          background: accent, color: paper,
          padding: "6px 14px", borderRadius: 8,
          fontSize: 12, fontWeight: 600,
          fontFamily: "var(--font-manrope), sans-serif",
          cursor: "default",
        }}>
          Finish & Transcribe →
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesRef} style={{
        flex: 1, overflowY: "auto", padding: "16px 20px",
        display: "flex", flexDirection: "column", gap: 12,
        width: 840,
      }}>
        {displayed.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "80%",
              padding: "10px 16px",
              borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: m.role === "user" ? accent : "rgba(0,0,0,0.05)",
              color: m.role === "user" ? paper : ink,
              fontSize: 14,
              lineHeight: 1.5,
              fontFamily: "var(--font-manrope), sans-serif",
            }}>
              {m.text}
            </div>
          </div>
        ))}

        {/* Currently typing */}
        {typingRole && (
          <div style={{ display: "flex", justifyContent: typingRole === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "80%",
              padding: "10px 16px",
              borderRadius: typingRole === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: typingRole === "user" ? accent : "rgba(0,0,0,0.05)",
              color: typingRole === "user" ? paper : ink,
              fontSize: 14,
              lineHeight: 1.5,
              fontFamily: "var(--font-manrope), sans-serif",
              whiteSpace: "pre-wrap",
            }}>
              {currentText}
              <span style={{
                display: "inline-block", width: 2, height: "1em",
                background: typingRole === "user" ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.4)",
                marginLeft: 2, verticalAlign: "text-bottom",
                animation: "bs-dot-pulse 0.7s step-end infinite",
              }} />
            </div>
          </div>
        )}

        {/* AI thinking dots */}
        {thinking && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{
              padding: "12px 18px",
              borderRadius: "16px 16px 16px 4px",
              background: "rgba(0,0,0,0.05)",
              display: "flex", gap: 5, alignItems: "center",
            }}>
              {[0, 0.2, 0.4].map((delay, i) => (
                <div key={i} style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: "rgba(0,0,0,0.3)",
                  animation: `bs-dot-pulse 1.2s ease-in-out ${delay}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{
        padding: "12px 16px 16px",
        borderTop: `1px solid ${border}`,
        flexShrink: 0,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(255,255,255,0.8)",
          border: `1px solid rgba(0,0,0,0.1)`,
          borderRadius: 16,
          padding: "10px 14px",
        }}>
          <div style={{
            flex: 1, fontSize: 14, fontFamily: "var(--font-manrope), sans-serif",
            color: "rgba(0,0,0,0.3)", lineHeight: 1.5,
          }}>
            Share your ideas…
          </div>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: cardBg, border: `1px solid ${border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </div>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: accent, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", textAlign: "center", marginTop: 6, fontFamily: "var(--font-manrope), sans-serif" }}>
          {displayed.length >= 2 ? `${Math.floor(displayed.length / 2)} exchanges · Ready to finish when you are` : "Keep going — share a few more ideas before finishing"}
        </div>
      </div>
    </div>
  );
}

const LANDING_BOOKS = [
  {
    title: "Leading With Clarity",
    author: "Marcus T.",
    genre: "Business / Leadership",
    cover: "linear-gradient(160deg, #B8763A 0%, #8B5A2B 40%, #6B4423 100%)",
    snippet: "The first time I told my team I didn't have the answer, I expected to lose their trust. Instead, I gained it. Leadership isn't about certainty — it's about direction. For years I thought great leaders never showed doubt. I was wrong. The teams that trusted me most were the ones who watched me sit with a hard problem, think out loud, and admit when I needed help. That vulnerability wasn't weakness. It was the whole thing.",
    review: "I never thought I'd write a book. But after years of leading teams through uncertainty, I realized the lessons I was sharing in meetings deserved a wider audience. D. scribe turned three hours of rambling voice memos into twelve coherent chapters.",
  },
  {
    title: "Faith in the Everyday",
    author: "Pastor Renee J.",
    genre: "Faith Community",
    cover: "linear-gradient(160deg, #4A5A6B 0%, #2C3A4A 40%, #1E2A35 100%)",
    snippet: "Grace doesn't wait for Sunday. I found it in the checkout line, in the argument I didn't start, in the apology I finally made. It lives in the ordinary. My congregation had been asking me to write this down for years — the small moments, the quiet miracles hiding inside Tuesday afternoons. I kept saying I wasn't a writer. But I had been preaching for twenty-six years. I had something to say.",
    review: "My congregation had been asking me to write down my sermons for years. What I couldn't have done in a decade, D. scribe helped me accomplish in a weekend. Every word still sounds like me.",
  },
  {
    title: "The Anxiety Playbook",
    author: "Dr. Sam K.",
    genre: "Self-Help",
    cover: "linear-gradient(160deg, #3D6B5A 0%, #2C5243 40%, #1E3B2F 100%)",
    snippet: "Anxiety lies to you about the future. The most powerful skill isn't silencing it — it's acting anyway, one small step at a time. I've spent fifteen years as a therapist saying this. The book I ended up writing isn't about curing anxiety. It's about learning to move while it's loud. Every tool inside came from someone who thought they were too broken to use it — and used it anyway.",
    review: "I recorded my thoughts during my morning runs for three months. D. scribe organized them into something I'm genuinely proud of — a practical guide that my patients actually want to read.",
  },
  {
    title: "Fifty Miles, Fifty Lessons",
    author: "James R.",
    genre: "Running / Memoir",
    cover: "linear-gradient(160deg, #6B5A42 0%, #4A3D2C 40%, #352B1F 100%)",
    snippet: "I signed up for my first ultramarathon at 47, eighteen months after my divorce. People thought I was having a crisis. Maybe I was. But somewhere around mile thirty-one on a trail in Colorado, I stopped running away from something and started running toward it. This book isn't really about running. It's about what happens when you put your body through something your mind says is impossible — and you survive it, and learn to do it again.",
    review: "I never journaled, never kept notes — just ran. D. scribe turned thirty voice recordings from my training runs into a real manuscript. People at my gym ask me where they can buy it.",
  },
  {
    title: "The First Generation",
    author: "Maria L.",
    genre: "Immigration / Family",
    cover: "linear-gradient(160deg, #8B3D50 0%, #6B2D3E 40%, #4A1F2C 100%)",
    snippet: "My mother crossed the border with eleven dollars and a name written on a napkin. She never learned to read English. Forty years later, I'm writing her story in a language she never had. This book is for every child who grew up translating — at the doctor's office, at the bank, at parent-teacher conferences. You weren't the child. You were the bridge. And that shaped you in ways you're still discovering.",
    review: "Writing this felt impossible — too emotional, too personal, too much. D. scribe gave me enough distance to tell the story honestly. My mother cried the first time I read it to her.",
  },
  {
    title: "Built From the Ground Up",
    author: "Derek O.",
    genre: "Entrepreneurship",
    cover: "linear-gradient(160deg, #6B6345 0%, #4A4531 40%, #352B1F 100%)",
    snippet: "I started my company with a work truck, a phone, and a list of people who owed me favors. No MBA. No investors. No plan beyond showing up every day. Eight years later we had forty-two employees and more work than we could handle. I'm not a business genius. I just refused to quit longer than anyone else did. This book is the manual I wish I'd had — the honest, unglamorous version of building something from nothing, mistake by mistake.",
    review: "Three years of late nights and hard lessons. I kept saying I'd write it all down someday. D. scribe made someday happen in about two weekends. Worth every minute.",
  },
];

function LandingBook({ title, author, cover, snippet, interactive = true }: { title: string; author: string; cover: string; snippet: string; interactive?: boolean }) {
  return (
    <div style={{ perspective: 1000, width: BOOK_W, height: BOOK_H, margin: "0 auto", cursor: "default" }}>
      <div className={`lbook-wrap${interactive ? "" : " lbook-static"}`} style={{ width: "100%", height: "100%", position: "relative", transformStyle: "preserve-3d" }}>
        {/* Glow */}
        <div className="lbook-glow" style={{ position: "absolute", bottom: -20, left: 20, right: 20, height: 40, background: "radial-gradient(ellipse, rgba(193,122,71,0.25) 0%, transparent 70%)", opacity: 0, transition: "opacity 0.6s ease", transform: "translateZ(-1px)" }} />
        {/* Back cover */}
        <div style={{ position: "absolute", inset: 0, background: "#2C1F15", borderRadius: "2px 10px 10px 2px", transform: "translateZ(-24px)" }} />
        {/* Page block */}
        <div style={{ position: "absolute", top: 4, bottom: 4, right: 0, width: 28, background: "linear-gradient(to right, #E8E0D0, #F4F1E8 30%, #EDE8DC 70%, #E0D8C8)", transform: "translateZ(-12px) translateX(4px)", borderRadius: "0 5px 5px 0", boxShadow: "inset -1px 0 2px rgba(0,0,0,0.05)" }}>
          {Array.from({ length: 26 }).map((_, i) => (
            <div key={i} style={{ position: "absolute", right: 2, top: 8 + i * 13, width: 20, height: 0.5, background: "rgba(0,0,0,0.04)" }} />
          ))}
        </div>
        {/* Spine */}
        <div style={{ position: "absolute", left: -12, top: 0, bottom: 0, width: 24, background: "linear-gradient(90deg, rgba(0,0,0,0.4), rgba(0,0,0,0.15) 30%, rgba(255,255,255,0.05) 70%, rgba(0,0,0,0.1))", transform: "rotateY(90deg) translateZ(0px)", transformOrigin: "right center", borderRadius: "4px 0 0 4px" }}>
          <div style={{ position: "absolute", top: 20, left: 4, right: 4, height: 1, background: "rgba(193,122,71,0.3)" }} />
          <div style={{ position: "absolute", bottom: 20, left: 4, right: 4, height: 1, background: "rgba(193,122,71,0.3)" }} />
        </div>
        {/* Inner page — revealed when cover swings open */}
        <div style={{ position: "absolute", inset: 0, background: "#FAF8F3", borderRadius: "2px 14px 14px 2px", display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 20px", boxSizing: "border-box", overflow: "hidden" }}>
          <div style={{ width: 20, height: 1, background: "#C17A47", opacity: 0.5, marginBottom: 16 }} />
          <p style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontSize: 11.5, lineHeight: 1.75, color: "#4A3D2C" }}>
            &ldquo;{snippet}&rdquo;
          </p>
        </div>
        {/* Front cover — rotates open on hover */}
        <div className="lbook-cover" style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transformOrigin: "left center", transition: "transform 0.75s cubic-bezier(0.16,1,0.3,1)" }}>
          {/* Front face */}
          <div style={{ position: "absolute", inset: 0, background: cover, borderRadius: "2px 14px 14px 2px", padding: "32px 24px", display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden", backfaceVisibility: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", opacity: 0.04, mixBlendMode: "multiply", pointerEvents: "none" }} />
            <div style={{ position: "absolute", top: 14, left: 14, right: 14, height: 1, background: "linear-gradient(to right, transparent, rgba(193,122,71,0.3), transparent)" }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ width: 28, height: 1, background: "rgba(193,122,71,0.5)", marginBottom: 18 }} />
              <h3 style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontSize: 22, fontWeight: 500, color: "#F4E8D1", lineHeight: 1.2, textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>{title}</h3>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", fontFamily: "var(--font-manrope), sans-serif", marginTop: 10 }}>{author}</p>
            </div>
            <div style={{ position: "absolute", bottom: 14, left: 14, right: 14, height: 1, background: "linear-gradient(to right, transparent, rgba(193,122,71,0.2), transparent)" }} />
          </div>
          {/* Inside of cover (paper) */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #EDE5D8, #F5EFE4)", borderRadius: "2px 14px 14px 2px", transform: "rotateY(180deg) translateZ(1px)", backfaceVisibility: "hidden" }} />
        </div>
      </div>
    </div>
  );
}

const BOOK_W = 266;
const BOOK_H = 373;

function BookCarousel({ books }: { books: typeof LANDING_BOOKS }) {
  const [current, setCurrent] = useState(0);
  const n = books.length;

  function circularOffset(i: number) {
    let d = ((i - current) % n + n) % n;
    if (d > Math.floor(n / 2)) d -= n;
    return d;
  }

  const goNext = () => setCurrent(c => (c + 1) % n);
  const goPrev = () => setCurrent(c => (c - 1 + n) % n);

  const arrowStyle: React.CSSProperties = {
    position: "absolute", top: `calc(50% - ${BOOK_H / 2 + 8}px)`, marginTop: BOOK_H / 2,
    width: 48, height: 48, borderRadius: "50%",
    background: "rgba(193,122,71,0.12)", border: "1px solid rgba(193,122,71,0.3)",
    color: "#C17A47", fontSize: 26, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.2s",
    zIndex: 20,
  };

  return (
    <div style={{ position: "relative", padding: "0 80px" }}>
      {/* 3D Stage */}
      <div style={{ position: "relative", height: BOOK_H + 60, perspective: "1400px", perspectiveOrigin: "50% 50%" }}>
        {books.map((book, i) => {
          const d = circularOffset(i);
          const isCenter = d === 0;
          const isAdj = Math.abs(d) === 1;
          const isVisible = Math.abs(d) <= 1;
          const tx = d * 348;
          const scale = isCenter ? 1 : 0.72;
          const ry = d * -28;
          const opacity = isCenter ? 1 : isAdj ? 0.65 : 0;

          return (
            <div
              key={book.title}
              onClick={() => {
                if (d === 1) goNext();
                if (d === -1) goPrev();
              }}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${tx}px), -50%) scale(${scale}) rotateY(${ry}deg)`,
                opacity,
                zIndex: isCenter ? 10 : isAdj ? 5 : 0,
                transition: "transform 0.65s cubic-bezier(0.16,1,0.3,1), opacity 0.65s cubic-bezier(0.16,1,0.3,1)",
                cursor: isAdj ? "pointer" : "default",
                pointerEvents: isVisible ? "auto" : "none",
              }}
            >
              <LandingBook {...book} interactive={isCenter} />
            </div>
          );
        })}
      </div>

      {/* Arrows */}
      <button onClick={goPrev} style={{ ...arrowStyle, left: 16 }}>‹</button>
      <button onClick={goNext} style={{ ...arrowStyle, right: 16 }}>›</button>

      {/* Dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8 }}>
        {books.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)} style={{
            width: i === current ? 24 : 8, height: 8, borderRadius: 4,
            background: i === current ? "#C17A47" : "rgba(193,122,71,0.25)",
            border: "none", cursor: "pointer", padding: 0,
            transition: "all 0.3s ease",
          }} />
        ))}
      </div>

      {/* Review card — synced to current book */}
      <div key={current} className="lbook-review-card" style={{
        maxWidth: 640, margin: "48px auto 0",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(249,247,242,0.08)",
        borderRadius: 20,
        padding: "32px 40px",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "#A89F94", marginBottom: 4, fontFamily: "var(--font-manrope), sans-serif" }}>
              {books[current].author}
            </div>
            <div style={{ fontFamily: "var(--font-playfair), serif", fontSize: 20, fontWeight: 600, color: "#F9F7F2" }}>
              {books[current].title}
            </div>
          </div>
          <span style={{ padding: "4px 14px", borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: "var(--font-manrope), sans-serif", border: "1px solid rgba(193,122,71,0.4)", background: "rgba(193,122,71,0.08)", color: "#C17A47", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
            {books[current].genre}
          </span>
        </div>
        <p style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontSize: 16, lineHeight: 1.7, color: "#A89F94" }}>
          &ldquo;{books[current].review}&rdquo;
        </p>
      </div>
    </div>
  );
}

function FadeSection({ children, className = "", delay = 0, style = {} }: { children: React.ReactNode; className?: string; delay?: number; key?: React.Key; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(24px)",
      transition: `opacity 0.6s ease-out ${delay}s, transform 0.6s ease-out ${delay}s`,
      ...style,
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
            <div style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif", fontSize: 44, fontWeight: 900, color: "#E6C18B", marginBottom: 4, marginTop: 0, marginLeft: -510 }}>7 steps</div>
            <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.6)", textTransform: "uppercase", letterSpacing: "0.15em", marginLeft: -510 }}>From voice to published book</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif", fontSize: 44, fontWeight: 900, color: "#E6C18B", marginBottom: 4, marginLeft: -720, marginTop: 0 }}>Your voice</div>
            <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.6)", textTransform: "uppercase", letterSpacing: "0.15em", marginLeft: -700 }}>AI writes in your style, not its own</div>
          </div>
        </div>
      </section>

      {/* ─── Pipeline Section ─── */}
      <section style={{ padding: "80px 40px", maxWidth: 1600, margin: "0 auto" }}>
        <FadeSection>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <h2 style={{
              fontFamily: "var(--font-playfair), serif", fontStyle: "italic",
              fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 400, marginBottom: 12,
            }}>
              Seven steps. One manuscript.
            </h2>
            <p style={{ fontFamily: "var(--font-lora), serif", fontSize: 16, color: "#A89F94" }}>
              From the first word you speak to the last page you export.
            </p>
          </div>
        </FadeSection>
        <div className="lv2-pipeline-grid" style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 40,
          alignItems: "center",
        }}>
          {/* Left: animated dashboard */}
          <div style={{ transform: "translateX(-25%)" }}>
            <FadeSection delay={0.1}>
              <PipelineDashboard />
            </FadeSection>
          </div>

          {/* Right: step list — shifted left into middle space */}
          <div style={{ position: "relative", transform: "translateX(-15%)" }}>
            <div style={{
              position: "absolute", left: 36, top: 0, bottom: 0, width: 1,
              background: "rgba(193,122,71,0.2)",
            }} />
            {PIPELINE.map((step, i) => (
              <FadeSection key={step.num} delay={i * 0.08}>
                <div style={{
                  display: "grid", gridTemplateColumns: "72px 1fr", gap: 24,
                  padding: "36px 0",
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
        </div>
      </section>

      {/* ─── Human + AI Collaboration ─── */}
      <section style={{
        padding: "96px 40px",
        background: "linear-gradient(to bottom, rgba(193,122,71,0.04), transparent)",
        borderTop: "1px solid rgba(249,247,242,0.06)",
      }}>
        <div className="lv2-humanai-grid" style={{ display: "grid", gridTemplateColumns: "55% 45%", gap: 80, alignItems: "center" }}>
          {/* Left: text + pillars */}
          <FadeSection>
            <div>
              <div style={{
                fontFamily: "var(--font-lora), serif", fontSize: 26,
                textTransform: "uppercase", letterSpacing: "0.14em",
                color: "#C17A47", marginBottom: 16, fontWeight: 600,
              }}>
                Human + AI
              </div>
              <h2 style={{
                fontFamily: "var(--font-playfair), serif", fontStyle: "italic",
                fontSize: "clamp(56px, 8vw, 84px)", fontWeight: 400,
                lineHeight: 1.2, marginBottom: 24,
              }}>
                You bring the ideas. We fill in the gaps.
              </h2>
              <p style={{
                fontFamily: "var(--font-lora), serif", fontSize: 36, lineHeight: 1.7,
                color: "#A89F94", maxWidth: 1500, marginBottom: 48,
              }}>
                D.&thinsp;scribe doesn&rsquo;t replace your ideas — it listens, learns your voice, and shapes your spoken words into prose that sounds like you wrote it by hand.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                {[
                  { title: "Your Voice", desc: "AI captures your speaking style — rhythm, vocabulary, pacing — and writes in it." },
                  { title: "Your Ideas", desc: "Every key point comes from your words. Nothing invented. Nothing hallucinated." },
                  { title: "Your Book", desc: "Edit every sentence. Rearrange every chapter. Export when it's ready. It's yours." },
                ].map((pillar) => (
                  <div key={pillar.title}>
                    <div style={{ width: 32, height: 2, background: "#C17A47", marginBottom: 16, opacity: 0.6 }} />
                    <h3 style={{ fontFamily: "var(--font-playfair), serif", fontSize: 36, fontWeight: 700, marginBottom: 8 }}>
                      {pillar.title}
                    </h3>
                    <p style={{ fontFamily: "var(--font-lora), serif", fontSize: 30, lineHeight: 1.6, color: "#A89F94" }}>
                      {pillar.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </FadeSection>

          {/* Right: brainstorm chat mock */}
          <FadeSection delay={0.2}>
            <BrainstormMock />
          </FadeSection>
        </div>
      </section>

      {/* ─── Written by real people ─── */}
      <FadeSection>
        <section className="py-32 relative z-20" style={{ color: "#7b651a", backgroundColor: "#312109" }}>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#1E1810]/60 to-transparent pointer-events-none" />
          <div className="max-w-[1440px] mx-auto px-6 lg:px-12 relative z-10">
            <div className="text-center max-w-3xl mx-auto mb-24">
              <h2 className="italic text-4xl md:text-6xl text-[#F9F7F2] mb-6" style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif" }}>
                Written by real people.
              </h2>
              <p className="text-lg md:text-xl font-light opacity-80" style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}>
                Everyday voices turned into books that last — stories, wisdom, and expertise finally on the page.
              </p>
            </div>
            <BookCarousel books={LANDING_BOOKS} />

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

        /* Review card fade-in */
        @keyframes lbook-card-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .lbook-review-card { animation: lbook-card-in 0.45s ease-out both; }

        /* Landing books */
        .lbook-wrap:hover .lbook-cover { transform: rotateY(-155deg); }
        .lbook-wrap:hover .lbook-glow { opacity: 1; }
        .lbook-static:hover .lbook-cover { transform: none !important; }
        .lbook-static:hover .lbook-glow { opacity: 0 !important; }

        /* Mobile */
        @media (max-width: 768px) {
          .landing-v2 nav { padding: 0 20px !important; }
          .lv2-pillars { grid-template-columns: 1fr !important; }
          .lv2-pipeline-grid { grid-template-columns: 1fr !important; gap: 40px !important; max-width: 600px !important; }
          .lv2-humanai-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
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
