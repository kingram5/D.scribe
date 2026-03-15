"use client";

import { Inter } from "next/font/google";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "600"] });

export default function NodumPage() {
  return (
    <div className={inter.className} style={styles.root}>
      {/* Environment background */}
      <div style={styles.environment} />

      {/* OS Bar */}
      <nav style={styles.osBar}>
        <div style={styles.brand}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          Nodum OS
        </div>
        <div style={{ color: "#7a7369", fontSize: 13, fontWeight: 500 }}>Workspace 1</div>
        <div style={{ fontFamily: "monospace", color: "#a0978a", fontSize: 13 }}>0.9.4_beta</div>
        <Link
          href="/"
          style={{
            marginLeft: 8,
            fontSize: 12,
            color: "#7a7369",
            textDecoration: "none",
            padding: "4px 12px",
            borderRadius: 100,
            border: "1px solid rgba(0,0,0,0.1)",
            transition: "all 0.2s",
          }}
        >
          ← Back to Manuscript
        </Link>
      </nav>

      {/* Workspace */}
      <main style={styles.workspace}>
        {/* Sidebar */}
        <aside className="nodum-sidebar nodum-glass" style={{ ...styles.glass, ...styles.sidebar }}>
          {/* Knowledge Graph */}
          <div style={styles.menuSection}>
            <div style={styles.menuHeader}>
              <span>Knowledge Graph</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <MenuItemComp icon={<CalendarIcon />} label="Topic Clusters" />
            <MenuItemComp icon={<ChevronDown />} label="AI Agents" nested />
            <MenuItemComp icon={<ChevronDown />} label="Claude Code" nested />
            <MenuItemComp icon={<ChevronRight />} label="Design Systems" nested />
          </div>

          {/* Intelligence */}
          <div style={styles.menuSection}>
            <div style={{ ...styles.menuHeader, justifyContent: "flex-start" }}>
              Intelligence
            </div>
            <MenuItemComp icon={<StarIcon />} label="Key Insights" />
            <MenuItemComp icon={<FileIcon />} label="Consensus Summaries" />
            <MenuItemComp icon={<InfoIcon />} label="Content Gaps" />
            <MenuItemComp icon={<BoxIcon />} label="Hook Library" />
          </div>

          {/* Forge Layer */}
          <div style={{ ...styles.menuSection, marginTop: "auto" }}>
            <div style={styles.menuHeader}>
              <span>Forge Layer</span>
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <MenuItemComp icon={<EditIcon />} label="Draft Scripts" />
            <MenuItemComp icon={<GridIcon />} label="Content Plans" />
          </div>
        </aside>

        {/* Center Stage */}
        <section style={styles.centerStage}>
          {/* SVG Connections */}
          <svg
            className="nodum-connections"
            style={styles.connections}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(0,0,0,0.0)" />
                <stop offset="50%" stopColor="rgba(0,0,0,0.15)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.0)" />
              </linearGradient>
            </defs>
            <path className="nodum-conn-path" d="M 100,200 Q 300,300 400,400" />
            <path className="nodum-conn-path" d="M 600,700 Q 400,500 400,400" />
            <path className="nodum-conn-path" d="M 700,200 Q 500,300 400,400" />
          </svg>

          {/* Floating Cards */}
          <div className="nodum-node-cluster" style={styles.nodeCluster}>
            <FloatingCard
              className="nodum-node-1"
              style={styles.node1}
              dotColor="#d4b895"
              label="Instagram Reel"
              body={`"How Anthropic's new Claude Code is changing the CLI landscape for developers..."`}
              metaLeft="@tech_insider"
              metaRight="00:45"
            />
            <FloatingCard
              className="nodum-node-2"
              style={styles.node2}
              dotColor="#8b8276"
              label="X Thread"
              body="I spent 20 hours analyzing the best agentic workflows. Here are 5 patterns you need to know."
              metaLeft="@ai_builder"
              metaRight="12 posts"
            />
            <FloatingCard
              className="nodum-node-3"
              style={styles.node3}
              dotColor="#1c1c1c"
              label="Article"
              body="The shift from prompt engineering to context architecture."
              metaLeft="Medium"
              metaRight="4 min read"
            />
          </div>

          {/* Hero Content */}
          <div className="nodum-glass" style={{ ...styles.glass, ...styles.heroContent }}>
            <h1 style={styles.h1}>
              Save inspiration.<br />
              Extract intelligence.<br />
              Create content.
            </h1>
            <p style={styles.subhead}>
              Turn saved videos into insights, research, and content strategy.<br />
              Nodum OS clusters your inspiration into actionable knowledge graphs.
            </p>
            <button type="button" style={styles.btn} onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLButtonElement).style.background = "#000000";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 12px 24px rgba(0,0,0,0.2)";
            }} onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLButtonElement).style.background = "#191816";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 20px rgba(0,0,0,0.15)";
            }}>
              Initialize Workspace
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </section>

        {/* Operations Panel */}
        <aside className="nodum-ops nodum-glass" style={{ ...styles.glass, ...styles.operations }}>
          <div className="nodum-panel-title" style={styles.panelTitle}>System Operations</div>

          <div>
            <NodumStepBlock num="01 — COLLECT" title="Save what inspires you" desc="Send posts, Reels, or videos to the Nodum bot. Your content is automatically collected in your workspace." />
            <NodumStepBlock num="02 — PROCESS" title="AI turns it into intelligence" desc="Nodum clusters similar content into topic Carddecks and runs agentic workflows to extract summaries." />
            <NodumStepBlock num="03 — GENERATE" title="Create with it" desc="Use the extracted knowledge to generate content plans, scripts, and posts in the Forge Layer on autopilot 24/7." />
          </div>

          <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "8px 0" }} />

          <div className="nodum-panel-title" style={styles.panelTitle}>I/O Telemetry</div>

          {/* IO Demo */}
          <div style={styles.ioDemo}>
            <div style={styles.ioHeader}>
              <span>JOB_ID: 984-X</span>
              <span style={{ color: "#191816" }}>COMPLETED</span>
            </div>
            <div style={styles.ioBody}>
              <div style={styles.ioInput}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                  <line x1="7" y1="2" x2="7" y2="22" />
                  <line x1="17" y1="2" x2="17" y2="22" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <line x1="2" y1="7" x2="7" y2="7" />
                  <line x1="2" y1="17" x2="7" y2="17" />
                  <line x1="17" y1="17" x2="22" y2="17" />
                  <line x1="17" y1="7" x2="22" y2="7" />
                </svg>
                <span style={{ fontSize: 14, fontWeight: 500, color: "#191816" }}>&quot;I saved 15 reels about Claude Code&quot;</span>
              </div>
              <div style={{ display: "flex", justifyContent: "center", color: "#7a7369" }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 19 5 12" />
                </svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <NodumDataPill label="Key Insights Extracted" metric="12 NODES" />
                <NodumDataPill label="Consensus Summary" metric="GENERATED" />
                <NodumDataPill label="Learning Roadmap" metric="MAPPED" />
              </div>
            </div>
          </div>
        </aside>
      </main>

      <style>{`
        .nodum-node-1 { animation: floatSlow1 12s ease-in-out infinite alternate; }
        .nodum-node-2 { animation: floatSlow2 15s ease-in-out infinite alternate-reverse; }
        .nodum-node-3 { animation: floatSlow1 10s ease-in-out infinite alternate; }
        @media (max-width: 1200px) {
          .nodum-node-cluster, .nodum-connections { display: none !important; }
          .nodum-node-1, .nodum-node-2, .nodum-node-3 { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────── */

function MenuItemComp({ icon, label, nested }: { icon: React.ReactNode; label: string; nested?: boolean }) {
  return (
    <div
      className="nodum-menu-item"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: nested ? "8px 8px 8px 28px" : "8px",
        fontSize: 14,
        fontWeight: nested ? 400 : 500,
        color: nested ? "#7a7369" : "#191816",
        cursor: "pointer",
        borderRadius: 12,
        transition: "all 0.2s",
      }}
    >
      <span style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", color: nested ? "#7a7369" : "#191816" }}>
        {icon}
      </span>
      {label}
    </div>
  );
}

function FloatingCard({
  style,
  dotColor,
  label,
  body,
  metaLeft,
  metaRight,
  className,
}: {
  style: React.CSSProperties;
  dotColor: string;
  label: string;
  body: string;
  metaLeft: string;
  metaRight: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        padding: 16,
        borderRadius: 20,
        background: "rgba(255,255,255,0.85)",
        border: "1px solid rgba(255,255,255,1)",
        backdropFilter: "blur(12px)",
        width: 220,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        boxShadow: "0 16px 32px rgba(0,0,0,0.06)",
        pointerEvents: "auto",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 600, color: "#7a7369", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor }} />
        {label}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.4, fontWeight: 500, color: "#191816", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {body}
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#a0978a", display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(0,0,0,0.04)", paddingTop: 10, marginTop: 4 }}>
        <span>{metaLeft}</span>
        <span>{metaRight}</span>
      </div>
    </div>
  );
}

function NodumStepBlock({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div
      className="nodum-step-block"
      style={{
        padding: 16,
        borderRadius: 20,
        background: "rgba(255,255,255,0.4)",
        border: "1px solid rgba(255,255,255,0.6)",
        transition: "all 0.3s ease",
        marginBottom: 12,
      }}
    >
      <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "#7a7369", marginBottom: 8 }}>{num}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#191816", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#7a7369", lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

function NodumDataPill({ label, metric }: { label: string; metric: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 14px",
      background: "linear-gradient(90deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 100%)",
      borderRadius: 12,
      fontSize: 13,
      fontWeight: 500,
      color: "#191816",
      borderLeft: "3px solid #191816",
      boxShadow: "0 2px 5px rgba(0,0,0,0.02)",
    }}>
      <span>{label}</span>
      <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "#7a7369" }}>{metric}</span>
    </div>
  );
}

/* ─── Icons ─────────────────────────────────────── */
const iconProps = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5 } as const;
const ChevronDown = () => <svg {...iconProps}><polyline points="6 9 12 15 18 9" /></svg>;
const ChevronRight = () => <svg {...iconProps}><polyline points="9 18 15 12 9 6" /></svg>;
const CalendarIcon = () => <svg {...iconProps}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
const StarIcon = () => <svg {...iconProps}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
const FileIcon = () => <svg {...iconProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
const InfoIcon = () => <svg {...iconProps}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>;
const BoxIcon = () => <svg {...iconProps}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>;
const EditIcon = () => <svg {...iconProps}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const GridIcon = () => <svg {...iconProps}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>;

/* ─── Styles ─────────────────────────────────────── */
const glassBase: React.CSSProperties = {
  background: "rgba(255,255,255,0.45)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgba(255,255,255,0.8)",
  boxShadow: "0 20px 40px -10px rgba(0,0,0,0.06), inset 0 1px 1px 0 rgba(255,255,255,0.9)",
  borderRadius: 32,
  position: "relative",
  overflow: "hidden",
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: "'Inter', -apple-system, sans-serif",
    backgroundColor: "#f1e6cd",
    color: "#191816",
    overflowX: "hidden",
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    perspective: "1000px",
    position: "relative",
  },
  environment: {
    position: "fixed",
    top: "-5%",
    left: "-5%",
    width: "110vw",
    height: "110vh",
    background: "radial-gradient(circle at 50% 30%, #f6ecd6 0%, #d5c7ad 100%)",
    zIndex: 0,
    pointerEvents: "none",
  },
  osBar: {
    position: "fixed",
    top: 24,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 24,
    padding: "10px 28px",
    borderRadius: 100,
    fontSize: 13,
    fontWeight: 500,
    letterSpacing: "0.02em",
    color: "#7a7369",
    zIndex: 100,
    background: "rgba(255,255,255,0.6)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
    border: "1px solid rgba(255,255,255,0.9)",
    backdropFilter: "blur(12px)",
  },
  brand: {
    color: "#191816",
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 600,
    fontSize: 13,
  },
  workspace: {
    position: "relative",
    width: "100%",
    maxWidth: 1600,
    height: "100vh",
    display: "grid",
    gridTemplateColumns: "280px 1fr 400px",
    gap: 32,
    padding: "80px 40px 40px",
    zIndex: 10,
  },
  glass: glassBase,
  sidebar: {
    height: "fit-content",
    padding: "32px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 32,
  },
  menuSection: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  menuHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.15em",
    color: "#a0978a",
    fontWeight: 600,
    marginBottom: 4,
    paddingLeft: 4,
  },
  centerStage: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    transformStyle: "preserve-3d",
  },
  heroContent: {
    textAlign: "center",
    maxWidth: 600,
    position: "relative",
    zIndex: 20,
    padding: 48,
    background: "rgba(255,255,255,0.3)",
  },
  h1: {
    fontSize: 56,
    fontWeight: 500,
    letterSpacing: "-0.03em",
    lineHeight: 1.1,
    marginBottom: 24,
    color: "#191816",
  },
  subhead: {
    fontSize: 18,
    color: "#7a7369",
    lineHeight: 1.5,
    marginBottom: 40,
    fontWeight: 400,
  },
  nodeCluster: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "100%",
    height: "100%",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
    zIndex: 10,
  },
  node1: { top: "10%", left: "-10%" },
  node2: { bottom: "15%", left: "-5%" },
  node3: { top: "20%", right: "-15%" },
  connections: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 5,
    opacity: 0.6,
    pointerEvents: "none",
  },
  operations: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
    height: "100%",
    padding: 24,
    overflowY: "auto",
    msOverflowStyle: "none",
    scrollbarWidth: "none",
  },
  panelTitle: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "#a0978a",
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  ioDemo: {
    border: "1px solid rgba(255,255,255,0.8)",
    borderRadius: 20,
    background: "rgba(255,255,255,0.3)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    boxShadow: "inset 0 2px 10px rgba(0,0,0,0.01)",
  },
  ioHeader: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 16px",
    background: "rgba(255,255,255,0.6)",
    borderBottom: "1px solid rgba(0,0,0,0.04)",
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "monospace",
    color: "#a0978a",
  },
  ioBody: {
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  ioInput: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 12,
    background: "rgba(255,255,255,0.6)",
    borderRadius: 12,
    border: "1px dashed rgba(0,0,0,0.15)",
  },
  btn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 28px",
    background: "#191816",
    border: "none",
    borderRadius: 100,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
  },
};
