"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Project, AudioUpload, Transcript, KeyPoint, Chapter } from "@/types";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import { PIPELINE, getActiveStep, isStepNavigable } from "@/lib/pipeline-step";

interface ProjectDetail extends Project {
  audio_uploads: AudioUpload[];
  transcripts: Transcript[];
  key_points: KeyPoint[];
  chapters: Chapter[];
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/* Step-specific animations for the pipeline detail card */
function StepAnimation({ stepKey }: { stepKey: string }) {
  const wrapStyle: React.CSSProperties = {
    width: "100%",
    flex: 1,
    minHeight: 300,
    borderRadius: 16,
    position: "relative",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid var(--ds-card-border)",
    background: "linear-gradient(135deg, var(--ds-card-bg) 0%, var(--ds-card-bg) 100%)",
  };

  switch (stepKey) {

    /* ───── 1. UPLOAD ───── */
    case "upload":
      return (
        <div style={wrapStyle}>
          <style>{`
            @keyframes sa-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
            @keyframes sa-pulse-ring { 0% { transform: translate(-50%,-50%) scale(1); opacity: 0.3; } 100% { transform: translate(-50%,-50%) scale(3.5); opacity: 0; } }
          `}</style>
          <div style={{ position: "relative", width: 320, height: 320, borderRadius: 48, border: "2px dashed rgba(193,122,71,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* Pulse rings */}
            <div style={{ position: "absolute", top: "50%", left: "50%", width: 112, height: 112, borderRadius: "50%", background: "#C17A47", animation: "sa-pulse-ring 2s infinite" }} />
            <div style={{ position: "absolute", top: "50%", left: "50%", width: 112, height: 112, borderRadius: "50%", background: "#C17A47", animation: "sa-pulse-ring 2s infinite 1s" }} />
            {/* Mic icon */}
            <svg width="88" height="88" viewBox="0 0 24 24" fill="none" stroke="#C17A47" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "relative", zIndex: 2, animation: "sa-float 3s infinite" }}>
              <rect x="9" y="1" width="6" height="12" rx="3" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
        </div>
      );

    /* ───── 2. TRANSCRIBE ───── */
    case "transcribe":
      return (
        <div style={wrapStyle}>
          <style>{`
            @keyframes sa-wave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
            @keyframes sa-particle { 0% { left: 0; } 100% { left: calc(100% - 5px); } }
            @keyframes sa-line-fill { 0%,40% { opacity: 0.1; } 60%,100% { opacity: 0.8; } }
          `}</style>
          <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "0 32px", width: "100%" }}>
            {/* Waveform bars */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, height: 120 }}>
              {[30, 60, 100, 50, 75].map((h, i) => (
                <div key={i} style={{ width: 8, height: `${h}%`, background: "#C17A47", borderRadius: 2, transformOrigin: "center", animation: `sa-wave 1.2s ease-in-out infinite ${i * 0.15}s` }} />
              ))}
            </div>
            {/* Dashed path with particle */}
            <div style={{ flex: 1, position: "relative", height: 1, backgroundImage: "repeating-linear-gradient(90deg, rgba(193,122,71,0.3), rgba(193,122,71,0.3) 4px, transparent 4px, transparent 8px)" }}>
              <div style={{ position: "absolute", top: -2, width: 14, height: 14, borderRadius: "50%", background: "#C17A47", animation: "sa-particle 2s linear infinite" }} />
            </div>
            {/* Text lines */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 100 }}>
              {[100, 80, 90, 60].map((w, i) => (
                <div key={i} style={{ width: `${w}%`, height: 4, borderRadius: 2, background: "rgba(193,122,71,0.3)", animation: `sa-line-fill 2s ease-in-out infinite ${i * 0.3}s` }} />
              ))}
            </div>
          </div>
        </div>
      );

    /* ───── 3. STRUCTURE — Book structure with chapters, word count, distribution bars ───── */
    case "structure":
      return (
        <div style={wrapStyle}>
          <style>{`
            @keyframes sa-chap-pop { 0%,10%{transform:scale(0);opacity:0} 20%,85%{transform:scale(1);opacity:1} 95%,100%{transform:scale(0.8);opacity:0} }
            @keyframes sa-line-grow { 0%,20%{width:0;opacity:0} 40%,80%{width:48px;opacity:1} 95%,100%{width:0;opacity:0} }
            @keyframes sa-word-fill { 0%,15%{width:0} 50%,85%{width:75%} 100%{width:0} }
            @keyframes sa-count-up { 0%,20%{opacity:0;transform:translateY(10px)} 40%,85%{opacity:1;transform:translateY(0)} 95%,100%{opacity:0;transform:translateY(-10px)} }
            @keyframes sa-bar-grow { 0%,30%{transform:scaleY(0)} 50%,85%{transform:scaleY(1)} 95%,100%{transform:scaleY(0)} }
            @keyframes sa-fade-in2 { 0%,40%{opacity:0} 60%,90%{opacity:1} 100%{opacity:0} }
            @keyframes sa-dash-flow { 0%{stroke-dashoffset:12} 100%{stroke-dashoffset:0} }
          `}</style>
          <div style={{ position: "relative", width: 600, height: 440, borderRadius: 16, background: "var(--ds-card-bg)", overflow: "hidden", border: "1px solid var(--ds-card-border)" }}>
            {/* Left: Chapter markers */}
            <div style={{ position: "absolute", left: 28, top: 28, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 18, color: "#C17A47", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, fontWeight: 500, fontFamily: "var(--font-manrope), sans-serif" }}>Chapters</div>
              {[1, 2, 3].map((n, i) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 8, background: "#C17A47", color: "var(--ds-paper)", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, animation: `sa-chap-pop 4s infinite ${i * 0.6}s` }}>{n}</div>
                  <div style={{ width: 0, height: 6, background: "var(--text-secondary)", borderRadius: 3, animation: `sa-line-grow 4s infinite ${i * 0.6 + 0.3}s` }} />
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--text-secondary)", color: "var(--ds-paper)", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, animation: "sa-chap-pop 4s infinite 1.8s", opacity: 0.7 }}>?</div>
                <span style={{ fontSize: 18, color: "var(--text-secondary)", animation: "sa-fade-in2 4s infinite 2s", fontFamily: "var(--font-manrope), sans-serif" }}>calculating...</span>
              </div>
            </div>

            {/* Right: Word count */}
            <div style={{ position: "absolute", right: 28, top: 28, width: 190 }}>
              <div style={{ fontSize: 18, color: "#C17A47", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16, fontWeight: 500, fontFamily: "var(--font-manrope), sans-serif" }}>Target Words</div>
              <div style={{ position: "relative", height: 16, background: "rgba(193,122,71,0.1)", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 0, background: "linear-gradient(90deg, #C17A47 0%, #D98B58 100%)", borderRadius: 8, animation: "sa-word-fill 4s infinite ease-out" }} />
              </div>
              <div style={{ fontSize: 28, color: "var(--text-primary)", fontWeight: 600, fontFamily: "var(--font-manrope), monospace", overflow: "hidden", height: 36, animation: "sa-count-up 4s infinite" }}>45,000</div>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed rgba(193,122,71,0.2)" }}>
                <div style={{ fontSize: 16, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-manrope), sans-serif" }}>Est. Pages</div>
                <div style={{ fontSize: 24, color: "var(--text-primary)", fontWeight: 500, marginTop: 4, animation: "sa-fade-in2 4s infinite 1.5s", fontFamily: "var(--font-manrope), sans-serif" }}>~180 pgs</div>
              </div>
            </div>

            {/* Bottom: Distribution bars */}
            <div style={{ position: "absolute", bottom: 24, left: 28, right: 28 }}>
              <div style={{ display: "flex", gap: 6, height: 64, alignItems: "flex-end" }}>
                {[60, 85, 70, 40, 30, 20].map((h, i) => (
                  <div key={i} style={{ flex: 1, background: i < 3 ? "#C17A47" : "var(--text-secondary)", borderRadius: "2px 2px 0 0", height: `${h}%`, animation: `sa-bar-grow 4s infinite ${0.2 + i * 0.3}s`, transformOrigin: "bottom", opacity: i < 3 ? 0.8 : 0.4 }} />
                ))}
              </div>
              <div style={{ height: 1, background: "rgba(193,122,71,0.2)", marginTop: 2 }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, color: "var(--text-secondary)", marginTop: 8, fontFamily: "var(--font-manrope), sans-serif" }}>
                <span>Structure</span>
                <span>balancing...</span>
              </div>
            </div>

            {/* Flow line */}
            <svg style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.3 }} viewBox="0 0 600 440">
              <path d="M100 110 Q 220 90 320 130" stroke="#C17A47" strokeWidth="2" fill="none" strokeDasharray="6 6">
                <animate attributeName="stroke-dashoffset" values="12;0" dur="2s" repeatCount="indefinite" />
              </path>
            </svg>
          </div>
          <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
            <span style={{ background: "var(--ds-card-bg)", backdropFilter: "blur(8px)", padding: "6px 16px", borderRadius: 9999, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 500, color: "#C17A47", border: "1px solid var(--ds-card-border)" }}>Configuring Blueprint</span>
          </div>
        </div>
      );

    /* ───── 4. ANALYZE (existing orbital) ───── */
    case "analyze":
      return (
        <div style={wrapStyle}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 30%, rgba(193,122,71,0.1) 0%, transparent 60%)" }} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 70% 70%, rgba(168,159,148,0.06) 0%, transparent 50%)" }} />
          <svg width="100%" height="100%" viewBox="0 0 400 300" style={{ position: "relative", zIndex: 1 }} preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="glowLg" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#C17A47" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#C17A47" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="glowSm" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#D98B58" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#D98B58" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="200" cy="150" r="60" fill="url(#glowLg)">
              <animate attributeName="r" values="80;90;80" dur="4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;1;0.8" dur="4s" repeatCount="indefinite" />
            </circle>
            <circle cx="200" cy="150" r="20" fill="#C17A47" opacity="0.9">
              <animate attributeName="r" values="15;17;15" dur="2s" repeatCount="indefinite" />
            </circle>
            <g opacity="0.8">
              <circle cx="200" cy="70" r="8" fill="#C17A47">
                <animateTransform attributeName="transform" type="rotate" from="0 200 150" to="360 200 150" dur="12s" repeatCount="indefinite" />
              </circle>
              <path d="M 200 150 L 200 70" stroke="#C17A47" strokeWidth="0.5" strokeDasharray="2 4" opacity="0.3">
                <animateTransform attributeName="transform" type="rotate" from="0 200 150" to="360 200 150" dur="12s" repeatCount="indefinite" />
              </path>
            </g>
            <g opacity="0.7">
              <circle cx="290" cy="150" r="6" fill="#D98B58">
                <animateTransform attributeName="transform" type="rotate" from="45 200 150" to="405 200 150" dur="18s" repeatCount="indefinite" />
              </circle>
              <path d="M 200 150 L 290 150" stroke="#D98B58" strokeWidth="0.5" strokeDasharray="1 5" opacity="0.2">
                <animateTransform attributeName="transform" type="rotate" from="45 200 150" to="405 200 150" dur="18s" repeatCount="indefinite" />
              </path>
            </g>
            <g opacity="0.9">
              <circle cx="200" cy="240" r="10" fill="#C17A47">
                <animateTransform attributeName="transform" type="rotate" from="120 200 150" to="480 200 150" dur="15s" repeatCount="indefinite" />
              </circle>
            </g>
            <g stroke="#C17A47" strokeWidth="0.5" opacity="0.4" fill="none">
              <path d="M120 100 L260 80 L280 200 L140 220 Z" opacity="0.2">
                <animate attributeName="opacity" values="0.1;0.3;0.1" dur="6s" repeatCount="indefinite" />
              </path>
              <path d="M100 150 L160 90 M240 210 L300 150" opacity="0.3">
                <animate attributeName="opacity" values="0.1;0.4;0.1" dur="5s" repeatCount="indefinite" />
              </path>
            </g>
            <circle cx="100" cy="80" r="2.5" fill="#A89F94">
              <animate attributeName="cy" values="80;70;80" dur="4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.3;0.8;0.3" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx="320" cy="220" r="2" fill="#D98B58">
              <animate attributeName="cx" values="320;330;320" dur="5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0.9;0.4" dur="4s" repeatCount="indefinite" />
            </circle>
            <circle cx="80" cy="200" r="3" fill="#A89F94">
              <animate attributeName="r" values="3;1;3" dur="3.5s" repeatCount="indefinite" />
            </circle>
            <circle cx="300" cy="60" r="1.5" fill="#C17A47">
              <animate attributeName="opacity" values="0.2;1;0.2" dur="2.5s" repeatCount="indefinite" />
            </circle>
          </svg>
          <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
            <span style={{ background: "var(--ds-card-bg)", backdropFilter: "blur(8px)", padding: "6px 16px", borderRadius: 9999, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 500, color: "#C17A47", border: "1px solid var(--ds-card-border)" }}>
              Processing Patterns
            </span>
          </div>
        </div>
      );

    /* ───── 5. GENERATE ───── */
    case "generate":
      return (
        <div style={wrapStyle}>
          <style>{`
            @keyframes sa-type { 0% { width: 0%; } 80%,100% { width: var(--sa-max-w); } }
            @keyframes sa-cursor-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
          `}</style>
          <div style={{ position: "relative", width: 300, height: 380, borderRadius: "8px 24px 8px 8px", background: "var(--ds-card-bg)", border: "1px solid var(--ds-card-border)", overflow: "hidden" }}>
            {/* Dog-ear */}
            <div style={{ position: "absolute", top: 0, right: 0, width: 32, height: 32, background: "linear-gradient(135deg, var(--ds-paper) 50%, rgba(193,122,71,0.2) 50%)" }} />
            {/* Text lines with cursor */}
            <div style={{ padding: "40px 32px 32px", display: "flex", flexDirection: "column", gap: 24 }}>
              {[
                { maxW: "85%", delay: "0s" },
                { maxW: "70%", delay: "1.5s" },
                { maxW: "90%", delay: "3s" },
                { maxW: "60%", delay: "4.5s" },
              ].map((line, i) => (
                <div key={i} style={{ position: "relative", height: 8, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    borderRadius: 4,
                    background: "rgba(193,122,71,0.3)",
                    // @ts-expect-error CSS custom property
                    "--sa-max-w": line.maxW,
                    width: 0,
                    animation: `sa-type 6s steps(20) infinite ${line.delay}`,
                  }} />
                  <div style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    width: 2,
                    height: "100%",
                    background: "#C17A47",
                    animation: "sa-cursor-blink 0.6s step-end infinite",
                  }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    /* ───── 6. EDITOR — Document editing with strikethroughs, cursor, and line movements ───── */
    case "editor":
      return (
        <div style={{ width: "100%", flex: 1, minHeight: 300, borderRadius: 16, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--ds-card-border)", background: "var(--ds-card-bg)" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(to right, rgba(193,122,71,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(193,122,71,0.15) 1px, transparent 1px)", backgroundSize: "20px 20px", opacity: 0.2, maskImage: "radial-gradient(circle at center, black, transparent 80%)", WebkitMaskImage: "radial-gradient(circle at center, black, transparent 80%)" }} />
          <style>{`
            .sa-edit-doc { width: 380px; height: 400px; background: var(--ds-card-bg); border-radius: 8px; box-shadow: 4px 8px 24px rgba(0,0,0,0.15); padding: 32px 28px; display: flex; flex-direction: column; gap: 28px; position: relative; overflow: hidden; border: 1px solid var(--ds-card-border); }
            .sa-edit-doc::before { content: ''; position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: rgba(193,122,71,0.2); }
            .sa-el { height: 14px; background: #C17A47; border-radius: 4px; opacity: 0.3; position: relative; transition: all 0.4s cubic-bezier(0.4,0,0.2,1); }
            .sa-strike { position: absolute; top: 50%; left: -5%; width: 0; height: 4px; background: var(--text-secondary); border-radius: 2px; transform-origin: left center; }
            .sa-cur { position: absolute; width: 4px; height: 36px; background: #C17A47; border-radius: 2px; opacity: 0; z-index: 20; }
            .sa-el1 .sa-strike { animation: sa-strike-l 5s infinite; }
            .sa-el1 { animation: sa-fade-out 5s infinite; }
            .sa-el2 .sa-cur { top: -4px; animation: sa-cur-edit 5s infinite 1s; }
            .sa-el2 { animation: sa-shrink 5s infinite 1s; }
            .sa-el3 { animation: sa-shift 5s infinite 2s; }
            .sa-el4 { animation: sa-appear 5s infinite 3s; }
            .sa-el5 { animation: sa-split 5s infinite 4s; }
            .sa-move-arr { position: absolute; right: -20px; top: -5px; width: 16px; height: 16px; opacity: 0; }
            .sa-el3 .sa-move-arr { animation: sa-arr-show 5s infinite 2s; }
            .sa-plus-ic { position: absolute; left: -18px; top: -3px; width: 12px; height: 12px; opacity: 0; }
            .sa-el4 .sa-plus-ic { animation: sa-plus-pop 5s infinite 3s; }
            @keyframes sa-strike-l { 0%,20%{width:0} 30%,70%{width:110%} 80%,100%{width:110%} }
            @keyframes sa-fade-out { 0%,30%{opacity:0.3;transform:translateX(0)} 50%{opacity:0.08;transform:translateX(5px)} 80%,100%{opacity:0.3;transform:translateX(0)} }
            @keyframes sa-cur-edit { 0%,10%{opacity:1;left:0} 20%{opacity:1;left:40%} 30%{opacity:0;left:40%} 100%{opacity:0;left:0} }
            @keyframes sa-shrink { 0%,15%{width:85%} 35%,75%{width:55%} 95%,100%{width:85%} }
            @keyframes sa-shift { 0%,15%{transform:translateY(0)} 35%,75%{transform:translateY(15px);opacity:0.4} 95%,100%{transform:translateY(0)} }
            @keyframes sa-appear { 0%,15%{opacity:0;transform:scaleX(0.8) translateX(-10px)} 35%,75%{opacity:0.4;transform:scaleX(1) translateX(0)} 95%,100%{opacity:0;transform:scaleX(0.8) translateX(-10px)} }
            @keyframes sa-split { 0%,15%{width:90%;box-shadow:none} 35%{width:90%;box-shadow:0 8px 0 0 rgba(193,122,71,0.15)} 50%,75%{width:70%;box-shadow:0 8px 0 0 rgba(193,122,71,0.25)} 95%,100%{width:90%;box-shadow:none} }
            @keyframes sa-arr-show { 0%,20%{opacity:0;transform:translateX(-5px)} 35%,75%{opacity:0.6;transform:translateX(0)} 90%,100%{opacity:0;transform:translateX(-5px)} }
            @keyframes sa-plus-pop { 0%,25%{opacity:0;transform:scale(0.5)} 40%,70%{opacity:0.8;transform:scale(1)} 85%,100%{opacity:0;transform:scale(0.5)} }
          `}</style>
          <div className="sa-edit-doc">
            {/* Line 1: Strikethrough */}
            <div className="sa-el sa-el1" style={{ width: "100%" }}>
              <div className="sa-strike" />
            </div>
            {/* Line 2: Cursor editing */}
            <div className="sa-el sa-el2" style={{ width: "85%" }}>
              <div className="sa-cur" />
            </div>
            {/* Line 3: Moving down */}
            <div className="sa-el sa-el3" style={{ width: "75%" }}>
              <div className="sa-move-arr">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#A89F94" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            {/* Line 4: New line appearing */}
            <div className="sa-el sa-el4" style={{ width: "80%" }}>
              <div className="sa-plus-ic">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#C17A47" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
            </div>
            {/* Line 5: Getting split */}
            <div className="sa-el sa-el5" style={{ width: "92%" }} />
            {/* Ghost line */}
            <div className="sa-el" style={{ width: "60%", opacity: 0.08 }} />
          </div>
          <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
            <span style={{ background: "var(--ds-card-bg)", backdropFilter: "blur(8px)", padding: "6px 16px", borderRadius: 9999, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 500, color: "#C17A47", border: "1px solid var(--ds-card-border)" }}>Refining Prose</span>
          </div>
        </div>
      );

    /* ───── 7. EXPORT ───── */
    case "export":
      return (
        <div style={wrapStyle}>
          <style>{`
            @keyframes sa-book-float { 0%,100% { transform: translateY(0) rotateY(0deg); } 50% { transform: translateY(-10px) rotateY(4deg); } }
            @keyframes sa-shine { 0% { left: -60%; } 100% { left: 120%; } }
            @keyframes sa-rise { 0% { transform: translateY(0); opacity: 0.6; } 100% { transform: translateY(-80px); opacity: 0; } }
          `}</style>
          <div style={{ position: "relative" }}>
            {/* Book */}
            <div style={{ width: 280, height: 380, borderRadius: "4px 16px 16px 4px", background: "linear-gradient(135deg, #C17A47, #8B5A2B)", position: "relative", overflow: "hidden", animation: "sa-book-float 4s ease-in-out infinite", boxShadow: "8px 8px 40px rgba(0,0,0,0.3)" }}>
              {/* Spine */}
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, background: "linear-gradient(180deg, rgba(249,247,242,0.15), rgba(249,247,242,0.05))" }} />
              {/* Circle emblem */}
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 110, height: 110, borderRadius: "50%", border: "3px solid rgba(249,247,242,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 32, height: 3, background: "rgba(249,247,242,0.4)", borderRadius: 2 }} />
              </div>
              {/* Shine sweep */}
              <div style={{ position: "absolute", top: 0, bottom: 0, width: "40%", background: "linear-gradient(90deg, transparent, rgba(249,247,242,0.12), transparent)", animation: "sa-shine 4s ease-in-out infinite" }} />
            </div>
            {/* Rising particles */}
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ position: "absolute", bottom: -16, left: 40 + i * 56, width: 12, height: 12, borderRadius: "50%", background: "#C17A47", animation: `sa-rise 2s ease-out infinite ${i * 0.6}s` }} />
            ))}
          </div>
        </div>
      );

    /* ───── FALLBACK ───── */
    default:
      return (
        <div style={wrapStyle}>
          <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>…</span>
        </div>
      );
  }
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        setProject(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return <PageShell><Spinner /></PageShell>;
  }

  if (!project) {
    return <PageShell><EmptyState message="Project not found" /></PageShell>;
  }

  const activeStep = getActiveStep(project);
  const currentPipeline = PIPELINE[activeStep] || PIPELINE[0];
  const totalWordCount = project.transcripts.reduce((sum, t) => sum + t.word_count, 0);
  const generatedChapters = project.chapters.filter((c) => c.status === "generated" || c.status === "edited");
  const generatedWordCount = generatedChapters.reduce((sum, c) => sum + (c.target_word_count || 0), 0);

  return (
    <PageShell>
      <style>{`
        @media (max-width: 768px) {
          .ds-project-split { flex-direction: column !important; overflow-y: auto !important; }
          .ds-project-split > div:first-child { width: 100% !important; padding: 24px 16px !important; }
          .ds-project-split > div:last-child { padding: 16px !important; }
        }

        /* Reachable steps had a click handler but no feedback, so nothing on
           this page looked navigable. Hover + focus make that legible. */
        .ds-step-row { transition: background 0.15s, transform 0.15s; }
        .ds-step-row:hover { background: var(--ds-card-bg); transform: translateX(2px); }
        .ds-step-row:focus-visible,
        .ds-step-dot:focus-visible,
        .ds-step-stage:focus-visible {
          outline: 2px solid #C17A47;
          outline-offset: 3px;
        }

        /* The dot itself stays 8px; the link around it is padded out to a 44px
           touch target and pulled back with negative margin so the row does
           not move. Hit area grows, layout does not. */
        .ds-step-dot {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px 8px;
          margin: -18px -8px;
          border-radius: 8px;
          transition: transform 0.15s;
        }
        .ds-step-dot[data-navigable="true"]:hover { transform: scale(1.35); }

        .ds-step-stage { display: block; transition: transform 0.2s, box-shadow 0.2s; }
        .ds-step-stage:hover { transform: translateY(-2px); }

        @media (prefers-reduced-motion: reduce) {
          .ds-step-row, .ds-step-dot, .ds-step-stage { transition: none; }
          .ds-step-row:hover, .ds-step-dot:hover, .ds-step-stage:hover { transform: none; }
        }
      `}</style>
      <div className="paper-theme ds-project-split" style={{
        display: "flex",
        flex: 1,
        overflow: "hidden",
      }}>
        {/* Left panel — project title + timeline */}
        <div style={{
          width: "42%",
          display: "flex",
          flexDirection: "column",
          padding: "48px 56px",
          overflowY: "auto",
          position: "relative",
          zIndex: 1,
        }}>
          {/* Back to dashboard */}
          <button
            onClick={() => router.push("/dashboard")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 9999,
              border: "1px solid var(--ds-input-border)",
              background: "transparent",
              color: "var(--text-secondary)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "var(--font-manrope), sans-serif",
              width: "fit-content",
              marginBottom: 48,
              transition: "all 0.15s",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Dashboard
          </button>

          {/* Project title */}
          <div style={{ marginBottom: 64 }}>
            <span style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              fontWeight: 500,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 16,
              fontFamily: "var(--font-manrope), sans-serif",
            }}>Book Project</span>
            <h1 style={{
              fontFamily: "var(--font-playfair), var(--font-lora), serif",
              fontSize: 56,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              marginBottom: 20,
            }}>
              {project.title}
            </h1>
            {project.description && (
              <p style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                maxWidth: 360,
                lineHeight: 1.6,
                fontFamily: "var(--font-manrope), sans-serif",
              }}>
                {project.description}
              </p>
            )}
          </div>

          {/* Timeline */}
          <div style={{ position: "relative", width: "100%", maxWidth: 400, marginLeft: 8 }}>
            {PIPELINE.map((step, i) => {
              const isComplete = i < activeStep;
              const isActive = i === activeStep;
              const isNavigable = isStepNavigable(i, activeStep);
              const isLast = i === PIPELINE.length - 1;
              const stepPath = `/project/${projectId}/${step.path}`;

              const rowStyle: React.CSSProperties = {
                position: "relative",
                display: "block",
                paddingLeft: 48,
                marginBottom: isLast ? 0 : 40,
                cursor: isNavigable ? "pointer" : "default",
                textDecoration: "none",
                color: "inherit",
                borderRadius: 12,
              };

              // Reachable steps render as real links: keyboard focus,
              // cmd/middle-click and open-in-new-tab all work, none of which a
              // div with an onClick ever did. Locked steps stay inert markup
              // rather than a disabled link.
              const rowInner = (
                <>
                  {/* Vertical line */}
                  {!isLast && (
                    <div style={{
                      position: "absolute",
                      left: 11,
                      top: 24,
                      bottom: -16,
                      width: 1,
                      background: isComplete ? "rgba(193,122,71,0.3)" : "var(--ds-card-border)",
                    }} />
                  )}

                  {/* Dot */}
                  <div style={{
                    position: "absolute",
                    left: isActive ? -2 : 0,
                    top: isActive ? -1 : 2,
                    width: isActive ? 28 : 24,
                    height: isActive ? 28 : 24,
                    borderRadius: "50%",
                    background: isActive ? "#C17A47" : "var(--ds-paper)",
                    border: isActive ? `4px solid var(--ds-paper)` : isComplete ? "1px solid var(--text-secondary)" : "1px solid var(--ds-card-border)",
                    boxShadow: isActive ? "0 0 0 1px #C17A47" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10,
                    transition: "all 0.2s",
                  }}>
                    {isComplete && <span style={{ color: "var(--text-primary)" }}><CheckIcon /></span>}
                  </div>

                  {/* Content */}
                  {isActive ? (
                    <div style={{
                      marginLeft: -4,
                      padding: 16,
                      borderRadius: 12,
                      background: "var(--ds-card-bg)",
                      border: "1px solid var(--ds-card-border)",
                    }}>
                      <span style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.15em",
                        fontWeight: 600,
                        color: "#C17A47",
                        display: "block",
                        marginBottom: 6,
                        fontFamily: "var(--font-manrope), sans-serif",
                      }}>Current Stage</span>
                      <h3 style={{
                        fontFamily: "var(--font-playfair), var(--font-lora), serif",
                        fontSize: 22,
                        color: "var(--text-primary)",
                        marginBottom: 6,
                      }}>{step.label}</h3>
                      <p style={{
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        lineHeight: 1.5,
                        fontFamily: "var(--font-manrope), sans-serif",
                      }}>{step.desc}</p>
                    </div>
                  ) : (
                    <div>
                      <h3 style={{
                        fontSize: 15,
                        fontWeight: isComplete ? 500 : 400,
                        color: isComplete ? "var(--text-secondary)" : "var(--text-tertiary)",
                        marginTop: 2,
                        fontFamily: "var(--font-manrope), sans-serif",
                      }}>{step.label}</h3>
                      {isComplete && (
                        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>Completed</p>
                      )}
                    </div>
                  )}
                </>
              );

              return isNavigable ? (
                <Link
                  key={step.key}
                  href={stepPath}
                  className="ds-step-row"
                  aria-label={`Go to ${step.label}`}
                  style={rowStyle}
                >
                  {rowInner}
                </Link>
              ) : (
                <div key={step.key} aria-disabled style={rowStyle} title={`${step.label} — not ready yet`}>
                  {rowInner}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel — current step detail card */}
        <div style={{
          flex: 1,
          borderLeft: "1px solid var(--ds-card-border)",
          background: "var(--ds-input-bg)",
          padding: "16px 24px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "stretch",
          alignItems: "stretch",
          overflowY: "auto",
          position: "relative",
        }}>
          {/* Detail card */}
          <div style={{
            width: "100%",
            background: "var(--ds-card-bg)",
            borderRadius: 32,
            padding: 40,
            border: "1px solid var(--ds-card-border)",
            boxShadow: "0 4px 30px rgba(0,0,0,0.2)",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            flex: 1,
          }}>
            {/* Noise texture */}
            <div style={{
              position: "absolute",
              inset: 0,
              opacity: 0.03,
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
              pointerEvents: "none",
            }} />

            {/* Step progress header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 32,
              position: "relative",
              zIndex: 1,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {PIPELINE.map((step, i) => {
                    const navigable = isStepNavigable(i, activeStep);
                    const dot = (
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        display: "block",
                        background: i <= activeStep ? "#C17A47" : "transparent",
                        border: i <= activeStep ? "none" : "1px solid var(--ds-input-border)",
                        opacity: i <= activeStep ? 1 : 0.4,
                      }} />
                    );
                    return navigable ? (
                      <Link
                        key={step.key}
                        href={`/project/${projectId}/${step.path}`}
                        className="ds-step-dot"
                        data-navigable="true"
                        aria-label={`Go to step ${i + 1}: ${step.label}`}
                        title={step.label}
                      >
                        {dot}
                      </Link>
                    ) : (
                      <span
                        key={step.key}
                        className="ds-step-dot"
                        aria-disabled
                        title={`${step.label} — not ready yet`}
                      >
                        {dot}
                      </span>
                    );
                  })}
                </div>
                <span style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  color: "#C17A47",
                  fontWeight: 600,
                  fontFamily: "var(--font-manrope), sans-serif",
                }}>Step {activeStep + 1} of {PIPELINE.length}</span>
              </div>
            </div>

            {/* Step title + description */}
            <div style={{ position: "relative", zIndex: 1, marginBottom: 32, flex: "0 0 auto" }}>
              <h2 style={{
                fontFamily: "var(--font-playfair), var(--font-lora), serif",
                fontSize: 36,
                color: "var(--text-primary)",
                marginBottom: 12,
              }}>{currentPipeline.label}</h2>
              <p style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                maxWidth: 440,
                fontFamily: "var(--font-manrope), sans-serif",
              }}>{currentPipeline.desc}</p>
            </div>

            {/* Animation area — the whole stage is a link to the current step.
                aria-hidden on the artwork so a screen reader gets the one
                label instead of a stream of decorative animation nodes. */}
            <Link
              href={`/project/${projectId}/${currentPipeline.path}`}
              className="ds-step-stage"
              aria-label={`Go to ${currentPipeline.label}`}
              style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column" }}
            >
              <div aria-hidden style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <StepAnimation stepKey={currentPipeline.key} />
              </div>
            </Link>

            {/* Footer metadata */}
            <div style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              paddingTop: 24,
              marginTop: 24,
              borderTop: "1px solid var(--ds-card-border)",
            }}>
              <div style={{ display: "flex", gap: 40 }}>
                <div>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", display: "block", marginBottom: 6, fontFamily: "var(--font-manrope), sans-serif" }}>
                    Audience
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-manrope), sans-serif" }}>
                    {project.audience || "General"}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", display: "block", marginBottom: 6, fontFamily: "var(--font-manrope), sans-serif" }}>
                    Status
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-manrope), sans-serif" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34D399", animation: "spin 3s linear infinite" }} />
                    {project.status.replace("_", " ")}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", display: "block", marginBottom: 6, fontFamily: "var(--font-manrope), sans-serif" }}>
                    Spoken Words
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-manrope), sans-serif" }}>
                    {totalWordCount > 0 ? totalWordCount.toLocaleString() : "—"}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", display: "block", marginBottom: 6, fontFamily: "var(--font-manrope), sans-serif" }}>
                    Generated Words
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-manrope), sans-serif" }}>
                    {generatedWordCount > 0 ? `~${generatedWordCount.toLocaleString()}` : "—"}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", display: "block", marginBottom: 6, fontFamily: "var(--font-manrope), sans-serif" }}>
                    Generated Chapters
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-manrope), sans-serif" }}>
                    {generatedChapters.length > 0 ? `${generatedChapters.length} / ${project.chapters.length}` : "—"}
                  </span>
                </div>
              </div>

              <button
                onClick={() => router.push(`/project/${projectId}/${currentPipeline.path}`)}
                style={{
                  background: "#C17A47",
                  color: "#F9F7F2",
                  padding: "12px 24px",
                  borderRadius: 9999,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "var(--font-manrope), sans-serif",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.2s",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                }}
              >
                View Details
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  border: "1px solid var(--ds-card-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <ArrowIcon />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
