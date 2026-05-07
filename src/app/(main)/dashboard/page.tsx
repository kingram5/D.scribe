"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Project } from "@/types";
import GlassCard from "@/components/ui/GlassCard";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { STATUS_COLORS } from "@/lib/constants";
import UsageWidget from "@/components/ui/UsageWidget";

// ── Rotating quotes — replace these with your 25 ──────────────────────────
const WORKSPACE_QUOTES: { text: string; author: string }[] = [
  { text: "The first draft is just you telling yourself the story.", author: "Terry Pratchett" },
  { text: "A writer only begins a book. A reader finishes it.", author: "Samuel Johnson" },
  { text: "You don't start out writing good stuff. You start out writing crap and thinking it's good stuff.", author: "Octavia Butler" },
  { text: "Fill your paper with the breathings of your heart.", author: "William Wordsworth" },
  { text: "The scariest moment is always just before you start.", author: "Stephen King" },
];

function MiniWaveform() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const numBars = 80;
    const vw = 500;
    const vh = 120;
    const bw = vw / numBars;
    const gap = 1;

    let rects = "";
    for (let i = 0; i < numBars; i++) {
      const x = i * bw;
      const n = i / numBars;
      const slow = Math.sin(n * Math.PI * 2);
      const fast = Math.sin(n * Math.PI * 8) * 0.4;
      const noise = (Math.random() - 0.5) * 0.2;
      const combined = (slow + fast + noise) / 1.5;
      const delay = n * -3.2;
      const dur = 1.5 + Math.random() * 1.5;
      const sMin = 0.05 + Math.abs(fast) * 0.3;
      const sMax = 0.5 + Math.abs(combined) * 0.5;
      rects += `<rect class="mini-bar" x="${x}" y="0" width="${bw - gap}" height="100%" style="--d:${delay}s;--dur:${dur}s;--smin:${sMin};--smax:${sMax}" />`;
    }

    el.innerHTML = `
      <style>
        .mini-bar { fill: #F0A878; transform-box: fill-box; transform-origin: center; animation: miniWave var(--dur, 2s) cubic-bezier(0.4,0,0.2,1) infinite alternate; animation-delay: var(--d, 0s); }
        @keyframes miniWave { 0% { transform: scaleY(var(--smin, 0.2)); opacity: 0.8; } 100% { transform: scaleY(var(--smax, 1)); opacity: 1; } }
      </style>
      <svg viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block;filter:drop-shadow(0 0 8px rgba(193,122,71,0.6)) contrast(1.2) saturate(1.1) brightness(1.05);">
        <defs><clipPath id="miniMask"><text x="50%" y="65%" text-anchor="middle" alignment-baseline="middle" font-family="var(--font-playfair),'Playfair Display',serif" font-style="italic" font-weight="500" font-size="100px" letter-spacing="-0.02em">D. scribe</text></clipPath></defs>
        <g clip-path="url(#miniMask)">${rects}</g>
      </svg>
    `;
  }, []);

  return <div ref={ref} style={{ width: 420, height: 105 }} />;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [quoteIdx] = useState(() => Math.floor(Math.random() * WORKSPACE_QUOTES.length));
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "in_progress" | "complete" | "erased">("all");
  const [eraseMode, setEraseMode] = useState(false);
  const [erasingId, setErasingId] = useState<string | null>(null);
  const [confirmEraseProject, setConfirmEraseProject] = useState<Project | null>(null);
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "";

  useEffect(() => {
    fetch("/api/project")
      .then((r) => r.json())
      .then((data) => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const activeProjects = projects.filter((p) => p.status !== "erased");
  const filtered = filter === "all"
    ? activeProjects
    : projects.filter((p) => p.status === filter);

  const draftCount = projects.filter((p) => p.status === "draft").length;
  const inProgressCount = projects.filter((p) => p.status === "in_progress").length;
  const completeCount = projects.filter((p) => p.status === "complete").length;
  const erasedCount = projects.filter((p) => p.status === "erased").length;

  async function eraseProject(projectId: string) {
    setErasingId(projectId);
    await fetch(`/api/project/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "erased" }),
    });
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, status: "erased" as const } : p));
    setErasingId(null);
    setEraseMode(false);
  }

  // Paper-theme overrides for cards floating on dark video bg
  const paperCard: React.CSSProperties & Record<string, string> = {
    background: "rgba(255,255,255,0.95)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(44,36,25,0.08)",
    boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
    color: "#2C2419",
    "--text-primary": "#2C2419",
    "--text-secondary": "#7A7358",
    "--text-tertiary": "#7A7358",
    "--glass-bg": "rgba(255,255,255,0.95)",
    "--glass-border": "rgba(44,36,25,0.08)",
    "--glass-highlight": "rgba(44,36,25,0.03)",
    "--ds-card-hover": "rgba(44,36,25,0.04)",
    "--shadow-glass": "0 4px 20px rgba(0,0,0,0.04)",
    "--menu-hover": "rgba(44,36,25,0.05)",
    "--menu-active": "rgba(44,36,25,0.08)",
  };

  return (
    <PageShell>
      {/* Cinematic video background — same as landing page */}
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
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "linear-gradient(to bottom, rgba(44,36,25,0.92) 0%, rgba(44,36,25,0.88) 30%, rgba(44,36,25,0.75) 50%, rgba(44,36,25,0.4) 70%, rgba(44,36,25,0.1) 90%, transparent 100%)",
        }} />
      </div>

      {/* Page hero header */}
      {/* Mini waveform — positioned at top-left, parallel with nav bar */}
      <div style={{ position: "absolute", top: 18, left: "10vw", zIndex: 5 }}>
        <MiniWaveform />
      </div>

      <div style={{ padding: "48px 40px 20px", maxWidth: 640, position: "relative", zIndex: 1 }} className="ds-hero-header">
        <h1 style={{
          fontSize: 48,
          fontWeight: 400,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          color: "#F9F7F2",
          marginBottom: 16,
          fontFamily: "var(--font-lora), serif",
        }}>
          {firstName ? `${firstName}\u2019s Books` : "Your Books"}
        </h1>
        <p style={{ fontSize: 16, color: "#A89F94", lineHeight: 1.6, fontWeight: 400, maxWidth: 440 }}>
          Your manuscripts, all in one place.
        </p>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .ds-dashboard-grid { grid-template-columns: 1fr !important; padding: 0 16px 24px !important; gap: 20px !important; overflow-y: auto !important; }
          .ds-hero-header { padding: 24px 16px 12px !important; }
          .ds-hero-header h1 { font-size: 32px !important; }
          .ds-dashboard-grid .lined-paper { transform: none !important; }
        }
      `}</style>
      <div className="ds-dashboard-grid" style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr 360px",
        gap: 32,
        padding: "0 40px 40px",
        position: "relative",
        flex: 1,
        overflow: "hidden",
        zIndex: 1,
      }}>
        {/* Left panel — Lined Paper */}
        <div className="lined-paper" style={{ transform: "rotate(-1deg)", alignSelf: "start" }}>
          <div className="scribble" style={{ top: 15, right: 15, transform: "rotate(10deg)" }}>
            Organize!
          </div>
          <h2 className="lined-paper-title">Project List</h2>
          <div className="handwritten-note">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {[
                { label: `All (${activeProjects.length})`, active: filter === "all", onClick: () => setFilter("all") },
                { label: `Draft (${draftCount})`, active: filter === "draft", onClick: () => setFilter("draft") },
                { label: `In Progress (${inProgressCount})`, active: filter === "in_progress", onClick: () => setFilter("in_progress") },
                { label: `Complete (${completeCount})`, active: filter === "complete", onClick: () => setFilter("complete") },
                { label: `Erased (${erasedCount})`, active: filter === "erased", onClick: () => setFilter("erased") },
              ].map((item) => (
                <div
                  key={item.label}
                  onClick={item.onClick}
                  style={{
                    cursor: "pointer",
                    padding: "4px 8px",
                    borderRadius: 4,
                    background: item.active ? "rgba(193, 122, 71, 0.1)" : "transparent",
                    textDecoration: item.active ? "underline" : "none",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: "1.4rem" }}>{item.active ? "→" : "•"}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "3rem", display: "flex", flexDirection: "column", gap: 10 }}>
              <Link
                href="/project/new"
                className="nodum-btn"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  fontFamily: "var(--font-kalam), 'Kalam', cursive",
                  fontSize: "1.1rem",
                  background: "transparent",
                  color: "#2C2419",
                  border: "1px solid #2C2419",
                  boxShadow: "none",
                }}
              >
                + New Project
              </Link>
              <button
                onClick={() => setEraseMode((v) => !v)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontFamily: "var(--font-kalam), 'Kalam', cursive",
                  fontSize: "1rem",
                  background: eraseMode ? "rgba(220,38,38,0.08)" : "transparent",
                  color: eraseMode ? "#dc2626" : "#7A7358",
                  border: `1px solid ${eraseMode ? "#dc2626" : "rgba(0,0,0,0.15)"}`,
                  borderRadius: 6,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {eraseMode ? "✕ Cancel Erase" : "⌫ Erase Project"}
              </button>
              {eraseMode && (
                <p style={{ fontSize: "0.8rem", color: "#dc2626", textAlign: "center", fontFamily: "var(--font-kalam), 'Kalam', cursive" }}>
                  Click a project to erase it
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Center */}
        <div>
          {loading ? (
            <Spinner />
          ) : filtered.length === 0 ? (
            <GlassCard style={{ padding: 48, ...paperCard }}>
              {filter === "all" && projects.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: "#2C2419", marginBottom: 8 }}>
                      Your book starts here.
                    </h2>
                    <p style={{ fontSize: 14, color: "#7A7358", lineHeight: 1.6 }}>
                      Three steps to turn your spoken words into a manuscript:
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {[
                      { num: "1", title: "Speak", desc: "Record live, upload an audio file, or paste a YouTube link." },
                      { num: "2", title: "Transcribe", desc: "AI converts your words to text with speaker detection." },
                      { num: "3", title: "Analyze", desc: "Key points extracted, voice profile built, chapter outline created." },
                      { num: "4", title: "Edit", desc: "Refine your manuscript chapter by chapter in the editor." },
                      { num: "5", title: "Export", desc: "Download your finished book as PDF or DOCX." },
                    ].map((step) => (
                      <div key={step.num} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: "#C17A47", color: "white",
                          fontSize: 13, fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          {step.num}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#2C2419" }}>{step.title}</div>
                          <div style={{ fontSize: 13, color: "#7A7358", marginTop: 2 }}>{step.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Link href="/project/new" className="nodum-btn" style={{ alignSelf: "flex-start" }}>
                    Create Your First Project
                  </Link>
                </div>
              ) : (
                <div style={{
                  border: "1.5px dashed rgba(44,36,25,0.15)",
                  borderRadius: "var(--radius-md)",
                  padding: 48,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                }}>
                  <p style={{ fontSize: 16, color: "#7A7358" }}>
                    No {filter.replace("_", " ")} projects
                  </p>
                </div>
              )}
            </GlassCard>
          ) : (
            <div style={{
              display: "flex",
              gap: 40,
              flexWrap: "wrap",
              paddingBottom: 16,
            }}>
              <style>{`
                .book-hover { transform-style: preserve-3d; transition: transform 0.6s cubic-bezier(0.16,1,0.3,1); }
                .book-hover:hover { transform: rotateY(-18deg) rotateX(4deg) translateY(-8px); }
                .book-hover:hover .book-glow { opacity: 1; }
              `}</style>
              {filtered.map((project, idx) => {
                const covers = [
                  "linear-gradient(160deg, #B8763A 0%, #8B5A2B 40%, #6B4423 100%)",
                  "linear-gradient(160deg, #3D6B5A 0%, #2C5243 40%, #1E3B2F 100%)",
                  "linear-gradient(160deg, #6B5A42 0%, #4A3D2C 40%, #352B1F 100%)",
                  "linear-gradient(160deg, #8B3D50 0%, #6B2D3E 40%, #4A1F2C 100%)",
                  "linear-gradient(160deg, #4A5A6B 0%, #2C3A4A 40%, #1E2A35 100%)",
                  "linear-gradient(160deg, #6B6345 0%, #4A4531 40%, #352B1F 100%)",
                ];
                const cover = covers[idx % covers.length];
                const statusColor = STATUS_COLORS[project.status] || "#A39B7D";
                const isErasing = erasingId === project.id;

                if (eraseMode) {
                  return (
                    <div
                      key={project.id}
                      onClick={() => !isErasing && setConfirmEraseProject(project)}
                      style={{ textDecoration: "none", perspective: 1000, width: 200, height: 280, cursor: isErasing ? "wait" : "pointer" }}
                    >
                      <div style={{ width: "100%", height: "100%", position: "relative", transformStyle: "preserve-3d", transition: "transform 0.2s", transform: "scale(0.97)" }}>
                        <div style={{ position: "absolute", inset: 0, background: cover, borderRadius: "2px 12px 12px 2px", opacity: 0.4 }} />
                        <div style={{ position: "absolute", inset: 0, background: "rgba(220,38,38,0.65)", borderRadius: "2px 12px 12px 2px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          <span style={{ fontSize: 28, color: "#fff" }}>⌫</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", textAlign: "center", padding: "0 12px" }}>
                            {project.title}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <Link key={project.id} href={`/project/${project.id}`} style={{ textDecoration: "none", perspective: 1000, width: 200, height: 280 }}>
                    <div className="book-hover" style={{ width: "100%", height: "100%", position: "relative", transformStyle: "preserve-3d" }}>
                      {/* Glow */}
                      <div className="book-glow" style={{ position: "absolute", bottom: -20, left: 20, right: 20, height: 40, background: "radial-gradient(ellipse, rgba(193,122,71,0.2) 0%, transparent 70%)", opacity: 0, transition: "opacity 0.6s ease", transform: "translateZ(-1px)" }} />

                      {/* Back cover */}
                      <div style={{ position: "absolute", inset: 0, background: "#2C1F15", borderRadius: "2px 8px 8px 2px", transform: "translateZ(-24px)" }} />

                      {/* Page block */}
                      <div style={{ position: "absolute", top: 4, bottom: 4, right: 0, width: 22, background: "linear-gradient(to right, #E8E0D0, #F4F1E8 30%, #EDE8DC 70%, #E0D8C8)", transform: "translateZ(-12px) translateX(4px)", borderRadius: "0 4px 4px 0", boxShadow: "inset -1px 0 2px rgba(0,0,0,0.05)" }}>
                        {Array.from({ length: 20 }).map((_, i) => (
                          <div key={i} style={{ position: "absolute", right: 2, top: 8 + i * 12, width: 16, height: 0.5, background: "rgba(0,0,0,0.04)" }} />
                        ))}
                      </div>

                      {/* Spine */}
                      <div style={{ position: "absolute", left: -12, top: 0, bottom: 0, width: 24, background: "linear-gradient(90deg, rgba(0,0,0,0.4), rgba(0,0,0,0.15) 30%, rgba(255,255,255,0.05) 70%, rgba(0,0,0,0.1))", transform: "rotateY(90deg) translateZ(0px)", transformOrigin: "right center", borderRadius: "4px 0 0 4px" }}>
                        <div style={{ position: "absolute", top: 20, left: 4, right: 4, height: 1, background: "rgba(193,122,71,0.3)" }} />
                        <div style={{ position: "absolute", bottom: 20, left: 4, right: 4, height: 1, background: "rgba(193,122,71,0.3)" }} />
                      </div>

                      {/* Front cover */}
                      <div style={{ position: "absolute", inset: 0, background: cover, borderRadius: "2px 12px 12px 2px", padding: "28px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between", transform: "translateZ(0px)", boxShadow: "0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.05)", overflow: "hidden" }}>
                        {/* Texture */}
                        <div style={{ position: "absolute", inset: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", opacity: 0.04, mixBlendMode: "multiply", pointerEvents: "none" }} />
                        <div style={{ position: "absolute", top: 12, left: 12, right: 12, height: 1, background: "linear-gradient(to right, transparent, rgba(193,122,71,0.3), transparent)" }} />

                        <div style={{ position: "relative", zIndex: 1, flex: 1 }}>
                          <div style={{ width: 24, height: 1, background: "rgba(193,122,71,0.5)", marginBottom: 16 }} />
                          <h3 style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif", fontStyle: "italic", fontSize: 22, fontWeight: 500, color: "#F4E8D1", lineHeight: 1.2, marginBottom: 8, textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
                            {project.title}
                          </h3>
                          <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.35)", fontFamily: "var(--font-manrope), sans-serif" }}>
                            {project.audience}
                          </p>
                        </div>

                        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 600, color: project.status === "draft" ? "rgba(200,200,200,0.7)" : project.status === "in_progress" ? "#C17A47" : statusColor, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-manrope), sans-serif" }}>
                            <div style={{ width: 5, height: 5, borderRadius: "50%", background: statusColor }} />
                            {project.status.replace("_", " ")}
                          </div>
                          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "var(--font-manrope), sans-serif" }}>
                            {new Date(project.updated_at).toLocaleDateString()}
                          </span>
                        </div>

                        <div style={{ position: "absolute", bottom: 12, left: 12, right: 12, height: 1, background: "linear-gradient(to right, transparent, rgba(193,122,71,0.2), transparent)" }} />

                        {/* Status overlay — DRAFT gets a desaturating overlay, IN_PROGRESS gets amber strip at bottom */}
                        {project.status === "draft" && (
                          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)", borderRadius: "inherit", pointerEvents: "none" }} />
                        )}
                        {project.status === "in_progress" && (
                          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: "#C17A47", borderRadius: "0 0 10px 2px", pointerEvents: "none" }} />
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Right panel — Lined Paper Workspace Notes + Usage */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, alignSelf: "start" }}>
        <UsageWidget />
        <div className="lined-paper" style={{ alignSelf: "start" }}>
          <div className="scribble" style={{ top: 10, right: 20 }}>
            * Coffee first.
          </div>
          <div className="scribble" style={{ bottom: 20, left: 10, transform: "rotate(5deg)" }}>
            {filtered.length > 0 ? `Finish ${filtered[0].title} draft!` : "Start writing!"}
          </div>
          <h2 className="lined-paper-title">Workspace Notes</h2>
          <div className="handwritten-note">
            <p>
              Total projects on the desk:{" "}
              <span style={{ fontWeight: 700, color: "#2C2419", fontSize: "1.4rem" }}>
                {activeProjects.length}
              </span>
            </p>
            <p style={{ marginTop: "1rem" }}>
              Currently in the works:{" "}
              <span style={{ color: "#C17A47", fontWeight: 700 }}>{projects.filter(p => p.status !== "complete" && p.status !== "erased").length}</span>
            </p>
            <p style={{ marginTop: "1rem" }}>
              Finished &amp; ready:{" "}
              <span style={{ color: "#059669", fontWeight: 700 }}>{completeCount}</span>
            </p>
            <div style={{ marginTop: "3rem", borderTop: "1px dashed rgba(0,0,0,0.1)", paddingTop: "1rem" }}>
              <p style={{ fontSize: "1rem", opacity: 0.8 }}>
                &ldquo;{WORKSPACE_QUOTES[quoteIdx].text}&rdquo;
              </p>
              <p style={{ fontSize: "0.9rem", textAlign: "right", marginTop: "0.5rem" }}>
                — {WORKSPACE_QUOTES[quoteIdx].author}
              </p>
            </div>
          </div>
        </div>
        </div>
      </div>
      {/* Erase confirmation modal */}
      {confirmEraseProject && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        }}
          onClick={() => setConfirmEraseProject(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "32px 28px",
              maxWidth: 380,
              width: "90%",
              boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>⌫</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#2C2419", marginBottom: 8 }}>
              Erase this project?
            </h2>
            <p style={{ fontSize: 14, color: "#7A7358", lineHeight: 1.6, marginBottom: 24 }}>
              Are you sure you want to erase <strong>&ldquo;{confirmEraseProject.title}&rdquo;</strong>? It will be moved to your Erased tab.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => setConfirmEraseProject(null)}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  background: "transparent",
                  border: "1px solid rgba(0,0,0,0.15)",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "#7A7358",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const p = confirmEraseProject;
                  setConfirmEraseProject(null);
                  eraseProject(p.id);
                }}
                disabled={erasingId === confirmEraseProject.id}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  background: "#dc2626",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "#fff",
                }}
              >
                Yes, Erase It
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
