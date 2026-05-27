"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Standalone preview of 3 candidate /analysis loading animations (items #2/#3).
 * Variant switcher + simulated pipeline clock so all three can be watched
 * start-to-finish without a real transcript or Ink spend. Throwaway preview —
 * the winner gets wired into the real analysis page; this route can be deleted.
 */

// ── Mock pipeline data ───────────────────────────────────────────────
const THEMES = ["grace", "redemption", "calling", "resilience", "purpose", "doubt", "renewal", "legacy"];
const VOICE_TRAITS = ["Conversational", "Narrative-driven", "Scripture-anchored"];
const CHAPTERS = [
  "The First Step",
  "Through the Valley",
  "Finding Your Voice",
  "When Doubt Comes",
  "The Turning Point",
  "Building Forward",
  "Legacy & Beyond",
];

// Simulated stages. Each advances `tick`; derived state below reads `tick`.
type Stage = {
  label: string;
  ms: number;
  themesUpTo?: number; // reveal THEMES up to this count
  phase: "start" | "keypoints" | "voice" | "outline_skeleton" | "outline_resolve" | "done";
};
const STAGES: Stage[] = [
  { label: "Reading your transcript…", ms: 700, phase: "start" },
  { label: "Extracting key points (1/4)…", ms: 950, themesUpTo: 2, phase: "keypoints" },
  { label: "Extracting key points (2/4)…", ms: 950, themesUpTo: 4, phase: "keypoints" },
  { label: "Extracting key points (3/4)…", ms: 950, themesUpTo: 6, phase: "keypoints" },
  { label: "Extracting key points (4/4)…", ms: 950, themesUpTo: 8, phase: "keypoints" },
  { label: "Building voice profile…", ms: 1900, themesUpTo: 8, phase: "voice" },
  { label: "Generating chapter outline…", ms: 1400, themesUpTo: 8, phase: "outline_skeleton" },
  { label: "Generating chapter outline…", ms: 900, themesUpTo: 8, phase: "outline_resolve" },
  { label: "Your analysis is ready.", ms: 0, themesUpTo: 8, phase: "done" },
];

function useSimulatedAnalysis() {
  const [tick, setTick] = useState(0);
  const [runId, setRunId] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const replay = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setTick(0);
    setRunId((r) => r + 1);
  }, []);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    let acc = 0;
    for (let i = 1; i < STAGES.length; i++) {
      acc += STAGES[i - 1].ms;
      const target = i;
      timers.current.push(setTimeout(() => setTick(target), acc));
    }
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [runId]);

  const stage = STAGES[Math.min(tick, STAGES.length - 1)];
  const themesRevealed = THEMES.slice(0, stage.themesUpTo ?? 0);
  const voiceActive = ["voice", "outline_skeleton", "outline_resolve", "done"].includes(stage.phase);
  const outlineActive = ["outline_skeleton", "outline_resolve", "done"].includes(stage.phase);
  const chaptersResolved = ["outline_resolve", "done"].includes(stage.phase);
  const keyPointsDone = voiceActive; // step 1 complete once we've moved past it

  return { stage, tick, themesRevealed, voiceActive, outlineActive, chaptersResolved, keyPointsDone, done: stage.phase === "done", replay };
}

type Sim = ReturnType<typeof useSimulatedAnalysis>;

// ── Concept 2B — Book Spine Build ────────────────────────────────────
function BookSpineBuild({ sim }: { sim: Sim }) {
  const { stage, themesRevealed, voiceActive, outlineActive, chaptersResolved } = sim;
  const blur = !voiceActive ? 3 : !outlineActive ? 1 : 0;
  const textOpacity = !voiceActive ? 0.25 : !outlineActive ? 0.45 : 0.6;
  const pageLines = Math.min(themesRevealed.length + 1, 8);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#241d14" }}>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "55fr 45fr", gap: 48, padding: "56px 48px", alignItems: "center" }}>
        {/* Left: raw transcript de-blurring */}
        <div style={{ position: "relative", maxHeight: "100%", overflow: "hidden" }}>
          {voiceActive && !outlineActive && <div className="lp-scanline" />}
          <div style={{ filter: `blur(${blur}px)`, transition: "filter 1.2s ease" }}>
            {FAUX_LINES.map((w, i) => (
              <p key={i} style={{
                fontFamily: "var(--font-lora), Georgia, serif", fontSize: 13, lineHeight: 1.85,
                color: `rgba(249,247,242,${textOpacity})`, margin: "0 0 6px", transition: "color 1.2s ease",
              }}>{w}</p>
            ))}
          </div>
        </div>

        {/* Right: book assembling */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          {!outlineActive ? (
            <div style={{
              width: 150, height: 220, borderRadius: "4px 14px 14px 4px",
              background: "rgba(193,122,71,0.15)", border: "1px solid rgba(193,122,71,0.35)",
              boxShadow: "0 24px 48px rgba(0,0,0,0.35)", position: "relative",
              display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, padding: "0 22px",
              transform: voiceActive ? "scale(1.05)" : "scale(1)", transition: "transform 0.4s ease",
            }}>
              <div style={{ position: "absolute", top: 14, left: 0, right: 0, textAlign: "center", fontFamily: "var(--font-manrope), sans-serif", fontSize: 9, letterSpacing: "0.2em", color: "rgba(249,247,242,0.3)" }}>D.SCRIBE</div>
              {Array.from({ length: pageLines }).map((_, i) => (
                <div key={i} className="lp-pageline" style={{ height: 1, background: "rgba(249,247,242,0.18)", animationDelay: `${i * 60}ms` }} />
              ))}
            </div>
          ) : (
            <div style={{ position: "relative", width: 240, height: 240 }}>
              {CHAPTERS.map((c, i) => (
                <div key={i} className="lp-pagecard" style={{
                  position: "absolute", left: "50%", top: 18 + i * 30, transform: "translateX(-50%)",
                  width: 210, padding: "10px 16px", borderRadius: 8,
                  background: "rgba(61,52,40,0.92)", border: "1px solid rgba(249,247,242,0.12)",
                  boxShadow: "0 6px 14px rgba(0,0,0,0.25)", animationDelay: `${i * 80}ms`,
                  fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontSize: 14, color: "#F9F7F2",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  opacity: chaptersResolved ? 1 : 0.35,
                }}>{chaptersResolved ? `${i + 1}. ${c}` : ""}</div>
              ))}
            </div>
          )}
        </div>
      </div>
      <StatusBar label={stage.label} dark />
    </div>
  );
}

const FAUX_LINES = [
  "so the thing i always come back to is that nobody",
  "really tells you how hard the first year is going to be",
  "and i remember sitting in my car after that meeting",
  "thinking maybe this whole thing was a mistake but",
  "then something shifted and i realized the fear was",
  "actually pointing me toward exactly what i needed to do",
  "my grandmother used to say that grace finds you in",
  "the places you stop looking and that stuck with me",
  "through everything that came after the long nights the",
  "doubt the moments i wanted to quit and start over",
  "but you keep showing up because the work matters more",
  "than the comfort and that is the whole point really",
];

// ── Concept 3A — Chip Cascade ────────────────────────────────────────
function ChipCascade({ sim }: { sim: Sim }) {
  const { stage, themesRevealed, voiceActive, outlineActive, chaptersResolved, keyPointsDone, done } = sim;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#FAF8F3" }}>
      <div style={{ flex: 1, overflow: "auto", padding: "48px 40px 24px", maxWidth: 720, width: "100%", margin: "0 auto" }}>
        <h1 style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontSize: 30, color: "#2C2419", textAlign: "center", margin: "0 0 32px", transition: "opacity 0.4s" }}>
          {done ? "Your analysis is ready." : "Reading your transcript…"}
        </h1>

        <SectionCard label="Key Points" active complete={keyPointsDone}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {themesRevealed.map((t) => (
              <span key={t} className="lp-chip" style={chipStyle}>{t}</span>
            ))}
          </div>
          <p style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 13, fontWeight: 600, color: "#7A7358", marginTop: 12 }}>
            {themesRevealed.length} theme{themesRevealed.length !== 1 ? "s" : ""} found{keyPointsDone ? "" : "…"}
          </p>
        </SectionCard>

        <SectionCard label="Voice Profile" active={voiceActive} complete={outlineActive}>
          {voiceActive ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {VOICE_TRAITS.map((t, i) => (
                <span key={t} className="lp-chip" style={{ ...chipStyle, color: "#7A7358", borderColor: "rgba(44,36,25,0.15)", background: "rgba(44,36,25,0.04)", animationDelay: `${i * 150}ms` }}>{t}</span>
              ))}
            </div>
          ) : (
            <p style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 13, color: "#A39B7D" }}>Analyzing your speaking patterns…</p>
          )}
        </SectionCard>

        <SectionCard label="Chapters" active={outlineActive} complete={chaptersResolved}>
          {outlineActive ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CHAPTERS.map((c, i) => (
                chaptersResolved ? (
                  <div key={i} style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontSize: 15, color: "#2C2419", padding: "6px 0" }}>{i + 1}. {c}</div>
                ) : (
                  <div key={i} className="lp-shimmer" style={{ height: 30, borderRadius: 8 }} />
                )
              ))}
            </div>
          ) : (
            <p style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 13, color: "#A39B7D" }}>Your outline will appear here…</p>
          )}
        </SectionCard>
      </div>
      <StatusBar label={stage.label} />
    </div>
  );
}

function SectionCard({ label, active, complete, children }: { label: string; active?: boolean; complete?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#FFFFFF", border: "1px solid rgba(44,36,25,0.08)", borderRadius: 16, padding: 24, marginBottom: 16,
      borderLeft: complete ? "3px solid #C17A47" : "1px solid rgba(44,36,25,0.08)",
      opacity: active ? 1 : 0.35, filter: active ? "blur(0)" : "blur(1.5px)",
      transition: "all 0.4s ease-out",
    }}>
      <div style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#A39B7D", marginBottom: 16 }}>{label}</div>
      {children}
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  background: "rgba(193,122,71,0.12)", border: "1px solid rgba(193,122,71,0.3)", borderRadius: 20,
  padding: "6px 14px", fontFamily: "var(--font-manrope), sans-serif", fontSize: 13, fontWeight: 500, color: "#C17A47",
  display: "inline-flex",
};

// ── Concept 3B — Vertical Timeline ───────────────────────────────────
function VerticalTimeline({ sim }: { sim: Sim }) {
  const { stage, themesRevealed, voiceActive, outlineActive, chaptersResolved, keyPointsDone, done } = sim;
  const fillPct = done ? 100 : outlineActive ? 100 : voiceActive ? 66 : 33;

  const nodeState = (idx: number): "done" | "active" | "locked" => {
    if (idx === 0) return keyPointsDone ? "done" : "active";
    if (idx === 1) return outlineActive ? "done" : voiceActive ? "active" : "locked";
    return chaptersResolved ? "done" : outlineActive ? "active" : "locked";
  };

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#FAF8F3", overflow: "hidden" }}>
      <AmbientBackdrop sim={sim} />
      <div style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", padding: "48px 40px 24px", maxWidth: 640, width: "100%", margin: "0 auto" }}>
        <h1 style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontSize: 30, color: "#2C2419", textAlign: "center", margin: "0 0 36px" }}>
          {done ? "Your analysis is ready." : "Reading your transcript…"}
        </h1>

        <div style={{ position: "relative", paddingLeft: 36 }}>
          {/* Rail */}
          <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 2, background: "rgba(44,36,25,0.08)" }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: `${fillPct}%`, background: "#C17A47", transition: "height 0.5s ease" }} />
          </div>

          <TimelineStep node={nodeState(0)} label="Key Points">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {themesRevealed.map((t) => <span key={t} className="lp-chip" style={chipStyle}>{t}</span>)}
            </div>
            <p style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 13, fontWeight: 600, color: "#7A7358", marginTop: 10 }}>
              {themesRevealed.length} theme{themesRevealed.length !== 1 ? "s" : ""} found
            </p>
          </TimelineStep>

          <TimelineStep node={nodeState(1)} label="Voice Profile">
            {voiceActive ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {VOICE_TRAITS.map((t, i) => (
                  <span key={t} className="lp-chip" style={{ ...chipStyle, color: "#7A7358", borderColor: "rgba(44,36,25,0.15)", background: "rgba(44,36,25,0.04)", animationDelay: `${i * 150}ms` }}>{t}</span>
                ))}
              </div>
            ) : <Skeletons rows={1} />}
          </TimelineStep>

          <TimelineStep node={nodeState(2)} label="Chapter Outline" last>
            {outlineActive ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {CHAPTERS.map((c, i) => (
                  chaptersResolved ? (
                    <div key={i} style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontSize: 14, color: "#2C2419", padding: "3px 0" }}>{i + 1}. {c}</div>
                  ) : <div key={i} className="lp-shimmer" style={{ height: 26, borderRadius: 6 }} />
                ))}
              </div>
            ) : <Skeletons rows={3} />}
          </TimelineStep>
        </div>
      </div>
      <div style={{ position: "relative", zIndex: 1 }}><StatusBar label={stage.label} /></div>
    </div>
  );
}

// ── Ambient backdrop for 3B (source → output story in the margins) ───
const GLYPHS = [
  { ch: "“", left: "5%", top: "6%", size: 300, dur: 26, delay: 0 },
  { ch: "&", left: "86%", top: "12%", size: 220, dur: 32, delay: 4 },
  { ch: "”", left: "79%", top: "60%", size: 320, dur: 28, delay: 8 },
  { ch: "¶", left: "10%", top: "68%", size: 200, dur: 30, delay: 2 },
  { ch: "§", left: "45%", top: "2%", size: 150, dur: 34, delay: 6 },
  { ch: "&", left: "92%", top: "78%", size: 170, dur: 24, delay: 1 },
];

function AmbientBackdrop({ sim }: { sim: Sim }) {
  const { themesRevealed, voiceActive, outlineActive } = sim;
  const pageLines = Math.min(themesRevealed.length + (outlineActive ? 2 : 0), 9);
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* warm copper glow + secondary accent glow for depth */}
      <div className="lp-glow" style={{
        position: "absolute", top: "50%", left: "50%", width: 1100, height: 1100, transform: "translate(-50%,-50%)",
        background: "radial-gradient(circle, rgba(193,122,71,0.20), rgba(193,122,71,0) 62%)",
      }} />
      <div className="lp-glow2" style={{
        position: "absolute", top: "28%", left: "72%", width: 620, height: 620, transform: "translate(-50%,-50%)",
        background: "radial-gradient(circle, rgba(224,93,58,0.12), rgba(224,93,58,0) 60%)",
      }} />
      {/* drifting serif glyphs */}
      {GLYPHS.map((g, i) => (
        <span key={i} className="lp-glyph" style={{
          position: "absolute", left: g.left, top: g.top, fontFamily: "var(--font-playfair), serif", fontStyle: "italic",
          fontSize: g.size, lineHeight: 1, color: "rgba(193,122,71,0.12)", animationDuration: `${g.dur}s`, animationDelay: `${g.delay}s`,
        }}>{g.ch}</span>
      ))}
      {/* LEFT: the source — slowly scrolling raw transcript */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: "30%",
        WebkitMaskImage: "linear-gradient(180deg, transparent, #000 16%, #000 84%, transparent)",
        maskImage: "linear-gradient(180deg, transparent, #000 16%, #000 84%, transparent)",
        opacity: voiceActive ? 1 : 0.85, transition: "opacity 1.2s ease",
      }}>
        <div className="lp-stream" style={{ padding: "0 26px" }}>
          {[...FAUX_LINES, ...FAUX_LINES].map((l, i) => (
            <p key={i} style={{ fontFamily: "var(--font-lora), serif", fontSize: 13, lineHeight: 2.0, color: "rgba(44,36,25,0.16)", margin: 0 }}>{l}</p>
          ))}
        </div>
      </div>
      {/* RIGHT: the output — ghosted book gaining pages */}
      <div style={{ position: "absolute", right: "3%", top: "50%", transform: "translateY(-50%)", width: 158, height: 224, opacity: 0.9 }}>
        <div style={{
          position: "relative", width: "100%", height: "100%", borderRadius: "3px 13px 13px 3px",
          border: "1px solid rgba(193,122,71,0.35)", background: "rgba(193,122,71,0.08)",
          boxShadow: "0 18px 40px rgba(44,36,25,0.10)",
          display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, padding: "0 18px",
          transform: outlineActive ? "scale(1.05)" : "scale(1)", transition: "transform 0.6s ease",
        }}>
          <div style={{ position: "absolute", top: 14, left: 0, right: 0, textAlign: "center", fontFamily: "var(--font-manrope), sans-serif", fontSize: 9, letterSpacing: "0.24em", color: "rgba(44,36,25,0.32)" }}>D.SCRIBE</div>
          {Array.from({ length: pageLines }).map((_, i) => (
            <div key={i} className="lp-pageline" style={{ height: 1.5, background: "rgba(44,36,25,0.20)", animationDelay: `${i * 70}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineStep({ node, label, last, children }: { node: "done" | "active" | "locked"; label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", paddingBottom: last ? 0 : 32 }}>
      <div style={{ position: "absolute", left: -36, top: 0 }}>
        {node === "active" ? (
          <div className="lp-pulse" style={{ width: 12, height: 12, borderRadius: "50%", background: "#C17A47" }} />
        ) : node === "done" ? (
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#C17A47", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 800 }}>{"✓"}</div>
        ) : (
          <div style={{ width: 12, height: 12, borderRadius: "50%", boxSizing: "border-box", border: "2px solid rgba(44,36,25,0.2)", background: "transparent" }} />
        )}
      </div>
      <div style={{ opacity: node === "locked" ? 0.3 : 1, transition: "opacity 0.3s" }}>
        <div style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: node === "locked" ? "#A39B7D" : "#2C2419", marginBottom: 12 }}>{label}</div>
        {children}
      </div>
    </div>
  );
}

function Skeletons({ rows }: { rows: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="lp-shimmer" style={{ height: 22, borderRadius: 6, width: i === rows - 1 ? "70%" : "100%" }} />)}
    </div>
  );
}

// ── Shared status bar ────────────────────────────────────────────────
function StatusBar({ label, dark }: { label: string; dark?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "14px 40px",
      borderTop: dark ? "1px solid rgba(249,247,242,0.08)" : "1px solid rgba(44,36,25,0.08)",
      background: dark ? "rgba(36,29,20,0.6)" : "rgba(250,248,243,0.8)",
    }}>
      <div className="lp-spin" style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(193,122,71,0.3)", borderTopColor: "#C17A47", flexShrink: 0 }} />
      <span style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 13, fontWeight: 600, color: "#C17A47" }}>{label}</span>
    </div>
  );
}

// ── Page shell + switcher ────────────────────────────────────────────
const VARIANTS = [
  { key: "2b", label: "2B · Book Spine" },
  { key: "3a", label: "3A · Chip Cascade" },
  { key: "3b", label: "3B · Timeline ⭐" },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

export default function LoadingPreviewPage() {
  const [variant, setVariant] = useState<VariantKey>("3b");
  const sim = useSimulatedAnalysis();

  // Replay automatically when switching variants so each starts fresh.
  const switchVariant = (k: VariantKey) => { setVariant(k); sim.replay(); };

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", fontFamily: "var(--font-manrope), sans-serif" }}>
      {variant === "2b" && <BookSpineBuild sim={sim} />}
      {variant === "3a" && <ChipCascade sim={sim} />}
      {variant === "3b" && <VerticalTimeline sim={sim} />}

      {/* Floating control bar */}
      <div style={{
        position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 50,
        display: "flex", alignItems: "center", gap: 6, padding: 6, borderRadius: 14,
        background: "rgba(20,16,11,0.82)", backdropFilter: "blur(12px)", border: "1px solid rgba(249,247,242,0.12)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}>
        {VARIANTS.map((v) => (
          <button key={v.key} onClick={() => switchVariant(v.key)} style={{
            padding: "8px 14px", fontSize: 12, fontWeight: 600, borderRadius: 9, cursor: "pointer",
            border: "none", transition: "all 0.15s",
            background: variant === v.key ? "#C17A47" : "transparent",
            color: variant === v.key ? "#fff" : "rgba(249,247,242,0.7)",
            fontFamily: "var(--font-manrope), sans-serif",
          }}>{v.label}</button>
        ))}
        <div style={{ width: 1, height: 20, background: "rgba(249,247,242,0.15)", margin: "0 2px" }} />
        <button onClick={sim.replay} style={{
          padding: "8px 14px", fontSize: 12, fontWeight: 600, borderRadius: 9, cursor: "pointer",
          border: "1px solid rgba(249,247,242,0.2)", background: "transparent", color: "rgba(249,247,242,0.85)",
          fontFamily: "var(--font-manrope), sans-serif",
        }}>{"↺ Replay"}</button>
      </div>

      <style>{`
        @keyframes lp-chipPop { 0% { opacity: 0; transform: scale(0.85); } 60% { transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
        .lp-chip { animation: lp-chipPop 0.3s ease-out both; }
        @keyframes lp-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(193,122,71,0.45); } 50% { box-shadow: 0 0 0 8px rgba(193,122,71,0); } }
        .lp-pulse { animation: lp-pulse 2s ease-in-out infinite; }
        @keyframes lp-spin { to { transform: rotate(360deg); } }
        .lp-spin { animation: lp-spin 0.8s linear infinite; }
        @keyframes lp-shimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
        .lp-shimmer { background: linear-gradient(90deg, rgba(193,122,71,0.06) 25%, rgba(193,122,71,0.14) 50%, rgba(193,122,71,0.06) 75%); background-size: 600px 100%; animation: lp-shimmer 1.4s linear infinite; }
        @keyframes lp-pageReveal { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        .lp-pageline { animation: lp-pageReveal 0.4s ease-out both; }
        @keyframes lp-cardReveal { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .lp-pagecard { animation: lp-cardReveal 0.45s ease-out both; }
        @keyframes lp-scan { 0% { transform: translateY(-110%); } 100% { transform: translateY(110%); } }
        .lp-scanline { position: absolute; left: 0; right: 0; height: 2px; z-index: 2; background: linear-gradient(90deg, transparent, #C17A47, transparent); animation: lp-scan 1.4s ease-in-out infinite; }
        @keyframes lp-glow { 0%,100% { transform: translate(-50%,-50%) scale(1); opacity: 0.8; } 50% { transform: translate(-50%,-53%) scale(1.14); opacity: 1; } }
        .lp-glow { animation: lp-glow 16s ease-in-out infinite; }
        @keyframes lp-glow2 { 0%,100% { transform: translate(-50%,-50%) scale(1.05); opacity: 0.7; } 50% { transform: translate(-46%,-44%) scale(1.2); opacity: 1; } }
        .lp-glow2 { animation: lp-glow2 13s ease-in-out infinite; }
        @keyframes lp-drift { 0% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-26px) rotate(3deg); } 100% { transform: translateY(0) rotate(0deg); } }
        .lp-glyph { animation: lp-drift ease-in-out infinite; }
        @keyframes lp-stream { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }
        .lp-stream { animation: lp-stream 36s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .lp-chip, .lp-pageline, .lp-pagecard, .lp-glow, .lp-glow2, .lp-glyph, .lp-stream { animation: none !important; }
          .lp-pulse { animation: none !important; box-shadow: 0 0 0 4px rgba(193,122,71,0.2) !important; }
          .lp-scanline { display: none !important; }
          .lp-shimmer { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
