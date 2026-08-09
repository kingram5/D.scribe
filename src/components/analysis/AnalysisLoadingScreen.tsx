"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Full-area loading screen for the /analysis step. Three.js copper dither-wave
 * background + three columns (Key Points / Voice Profile / Outline) that fill
 * with real pipeline data as each stage completes. Driven by `step`
 * (the live analyzeStep label) + the data arrays — no fake timers.
 */

const COPPER = "#C17A47";
const TEXT_PRIMARY = "var(--text-primary, #2C2419)";
const TEXT_MUTED = "var(--text-secondary, #7A7358)";
const BORDER = "var(--ds-card-border, #E8E2D4)";
const glassPanel: React.CSSProperties = {
  background: "rgba(255,255,255,0.5)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  border: "1px solid rgba(232,226,212,0.6)",
};

// ── Three.js dither-wave background ──────────────────────────────────
const VS = `
  varying float vElevation;
  uniform float uTime;
  void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    float elevation = sin(modelPosition.x * 2.5 + uTime * 0.4) *
                      sin(modelPosition.z * 1.5 + uTime * 0.3) * 0.5;
    modelPosition.y += elevation;
    vElevation = elevation;
    gl_Position = projectionMatrix * viewMatrix * modelPosition;
  }
`;
const FS = `
  varying float vElevation;
  float dither(vec2 position, float brightness) {
    int x = int(mod(position.x, 4.0));
    int y = int(mod(position.y, 4.0));
    int index = x + y * 4;
    float limit = 0.0;
    if (index == 0) limit = 0.0625; if (index == 8) limit = 0.5625;
    if (index == 2) limit = 0.1875; if (index == 10) limit = 0.6875;
    if (index == 12) limit = 0.8125; if (index == 4) limit = 0.3125;
    if (index == 14) limit = 0.9375; if (index == 6) limit = 0.4375;
    if (index == 3) limit = 0.25; if (index == 11) limit = 0.75;
    if (index == 1) limit = 0.125; if (index == 9) limit = 0.625;
    if (index == 15) limit = 1.0; if (index == 7) limit = 0.5;
    if (index == 13) limit = 0.875; if (index == 5) limit = 0.375;
    return brightness < limit ? 0.0 : 1.0;
  }
  void main() {
    float light = vElevation * 1.5 + 0.6;
    vec2 screenPos = gl_FragCoord.xy / 2.5;
    float d = dither(screenPos, light);
    vec3 color = mix(vec3(0.75, 0.47, 0.28), vec3(0.98, 0.97, 0.95), d);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function DitherWaveBackground() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mount = ref.current;
    if (!mount) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const w = () => mount.clientWidth || window.innerWidth;
    const h = () => mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w() / h(), 0.1, 100);
    camera.position.set(2, 2, 2);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w(), h());
    mount.appendChild(renderer.domElement);

    const geometry = new THREE.PlaneGeometry(6, 6, 128, 128);
    geometry.rotateX(-Math.PI * 0.5);
    const material = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: { uTime: { value: 0 } },
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      material.uniforms.uTime.value = clock.getElapsedTime();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    if (reduce) renderer.render(scene, camera);
    else loop();

    const onResize = () => {
      camera.aspect = w() / h();
      camera.updateProjectionMatrix();
      renderer.setSize(w(), h());
    };
    window.addEventListener("resize", onResize);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      const c = renderer.domElement;
      if (c.parentNode) c.parentNode.removeChild(c);
    };
  }, []);
  return <div ref={ref} aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, opacity: 0.4, pointerEvents: "none" }} />;
}

// ── Loading screen ───────────────────────────────────────────────────
interface AnalysisLoadingScreenProps {
  step: string | null;
  complete?: boolean;
  keyPoints: string[];
  traits: string[];
  chapters: string[];
}

const colHeadLabel: React.CSSProperties = { fontFamily: "var(--font-manrope), sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: TEXT_PRIMARY };
const colCount: React.CSSProperties = { fontSize: 10, fontFamily: "ui-monospace, monospace", color: COPPER };

export default function AnalysisLoadingScreen({ step, complete, keyPoints, traits, chapters }: AnalysisLoadingScreenProps) {
  const stage = complete ? 4
    : !step ? 1
    : /key point/i.test(step) ? 1
    : /voice/i.test(step) ? 2
    : /outline/i.test(step) ? 3
    : 1;

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", background: "#FAF8F3" }}>
      <DitherWaveBackground />
      <div style={{ position: "relative", zIndex: 10, height: "100%", overflowY: "auto", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)", padding: "56px 48px 120px" }}>
        {/* Header */}
        <header style={{ maxWidth: 1024, margin: "0 auto 56px", textAlign: "center" }}>
          <span className="als-slideup" style={{ display: "block", fontFamily: "var(--font-manrope), sans-serif", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3em", color: COPPER, marginBottom: 16 }}>
            Step {Math.min(stage, 3)} of 3 · Analysis
          </span>
          <h1 key={stage} className="als-slideup" style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontSize: 44, color: TEXT_PRIMARY, margin: "0 0 20px", animationDelay: "0.1s" }}>
            {complete ? "Analysis complete"
              : stage === 2 ? "Learning how you sound…"
              : stage === 3 ? "Mapping the book's spine…"
              : "Finding what carries weight…"}
          </h1>
          <p className="als-slideup" style={{ fontFamily: "var(--font-manrope), sans-serif", color: TEXT_MUTED, fontSize: 14, maxWidth: 520, margin: "0 auto", lineHeight: 1.7, animationDelay: "0.2s" }}>
            {complete
              ? "Key points, voice profile, and outline are ready below."
              : stage === 2 ? "Building a profile of your diction, rhythm, and signature moves — so the chapters read like you."
              : stage === 3 ? "Arranging what you said into chapters your reader can follow."
              : "Weighing your key points by what you said and how you said it. You remain the final architect."}
          </p>
        </header>

        {/* 3 columns */}
        <div className="als-grid" style={{ maxWidth: 1152, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 48 }}>
          {/* Key Points */}
          <div style={{ opacity: stage >= 1 ? 1 : 0.2, transition: "opacity 0.7s" }}>
            <div style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 16, marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <h3 style={colHeadLabel}>Key Points</h3>
              <span style={colCount}>{keyPoints.length || ""}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {keyPoints.map((t, i) => (
                <div key={i} className="als-row" style={{ ...glassPanel, minHeight: 48, borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: COPPER, flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 14, fontWeight: 500, color: TEXT_PRIMARY }}>{t}</span>
                </div>
              ))}
              {stage === 1 && (
                <div className="als-shimmer" style={{ height: 48, borderRadius: 8, opacity: 0.5 }} />
              )}
            </div>
          </div>

          {/* Voice Profile */}
          <div style={{ opacity: stage >= 2 ? 1 : 0.2, transition: "opacity 0.7s" }}>
            <div style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 16, marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <h3 style={colHeadLabel}>Voice Profile</h3>
              <span style={colCount}>{traits.length || ""}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {traits.map((trait, i) => (
                <div key={i} className="als-row" style={{ paddingLeft: 16, borderLeft: `2px solid ${COPPER}` }}>
                  <div style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontSize: 20, color: TEXT_PRIMARY }}>{trait}</div>
                  <div style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.02em", color: TEXT_MUTED, marginTop: 4 }}>Voice marker identified</div>
                </div>
              ))}
              {stage === 2 && traits.length === 0 && <div className="als-shimmer" style={{ height: 44, borderRadius: 8, opacity: 0.5 }} />}
            </div>
          </div>

          {/* Outline */}
          <div style={{ opacity: stage >= 3 ? 1 : 0.2, transition: "opacity 0.7s" }}>
            <div style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 16, marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <h3 style={colHeadLabel}>Outline</h3>
              <span style={colCount}>{chapters.length || ""}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {chapters.map((ch, i) => (
                <div key={i} className="als-row" style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", color: COPPER, fontSize: 18 }}>{(i + 1).toString().padStart(2, "0")}</span>
                  <span style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: TEXT_PRIMARY }}>{ch}</span>
                </div>
              ))}
              {stage === 3 && chapters.length === 0 && (
                <>
                  <div className="als-shimmer" style={{ height: 18, borderRadius: 6, opacity: 0.5 }} />
                  <div className="als-shimmer" style={{ height: 18, borderRadius: 6, width: "80%", opacity: 0.5 }} />
                  <div className="als-shimmer" style={{ height: 18, borderRadius: 6, width: "60%", opacity: 0.5 }} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Status pill */}
        <div style={{ ...glassPanel, position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12, padding: "14px 28px", borderRadius: 9999, boxShadow: "0 20px 40px -12px rgba(0,0,0,0.2)" }}>
          <div className={complete ? undefined : "als-pulse"} style={{ width: 8, height: 8, borderRadius: "50%", background: complete ? "#16a34a" : COPPER }} />
          <span style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: TEXT_PRIMARY }}>
            {complete ? "Analysis complete" : step || "Starting analysis…"}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes als-slideup { 0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: translateY(0); } }
        .als-slideup { animation: als-slideup 0.6s cubic-bezier(0.16,1,0.3,1) forwards; opacity: 0; }
        @keyframes als-rowin { 0% { opacity: 0; transform: translateX(-10px); } 100% { opacity: 1; transform: translateX(0); } }
        .als-row { animation: als-rowin 0.5s ease-out both; }
        @keyframes als-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .als-shimmer { background: linear-gradient(90deg, rgba(193,122,71,0.05) 25%, rgba(193,122,71,0.12) 50%, rgba(193,122,71,0.05) 75%); background-size: 200% 100%; animation: als-shimmer 2s infinite linear; }
        @keyframes als-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(193,122,71,0.5); } 50% { box-shadow: 0 0 0 7px rgba(193,122,71,0); } }
        .als-pulse { animation: als-pulse 2s ease-in-out infinite; }
        @media (max-width: 860px) { .als-grid { grid-template-columns: 1fr !important; } }
        @media (prefers-reduced-motion: reduce) {
          .als-slideup { animation: none !important; opacity: 1 !important; }
          .als-row, .als-shimmer, .als-pulse { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
