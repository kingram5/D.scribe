"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";

/* ─── Document Preview SVGs ─── */

function PdfPreview() {
  return (
    <svg width="120" height="150" viewBox="0 0 120 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Page body */}
      <rect x="0" y="0" width="120" height="150" rx="6" fill="var(--ds-input-bg)" stroke="var(--ds-card-border)" strokeWidth="1" />
      {/* Dog-ear fold */}
      <path d="M95 0 L120 25 L95 25 Z" fill="var(--env-bg)" />
      <path d="M95 0 L120 25" stroke="var(--ds-card-border)" strokeWidth="1" />
      <path d="M120 25 L95 25 L95 0" stroke="var(--ds-input-bg)" strokeWidth="1" />
      {/* Copper header bar */}
      <rect x="12" y="12" width="75" height="6" rx="3" fill="#C17A47" />
      {/* Text lines */}
      <rect x="12" y="30" width="96" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="39" width="80" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="48" width="88" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="57" width="60" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="70" width="96" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="79" width="72" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="88" width="90" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="97" width="66" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="110" width="96" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="119" width="50" height="3" rx="1.5" fill="var(--ds-card-border)" />
      {/* PDF label */}
      <text x="108" y="143" textAnchor="end" fill="#C17A47" fontSize="11" fontWeight="700" fontFamily="var(--font-manrope), sans-serif">PDF</text>
    </svg>
  );
}

function DocxPreview() {
  return (
    <svg width="120" height="150" viewBox="0 0 120 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="120" height="150" rx="6" fill="var(--ds-input-bg)" stroke="var(--ds-card-border)" strokeWidth="1" />
      <path d="M95 0 L120 25 L95 25 Z" fill="var(--env-bg)" />
      <path d="M95 0 L120 25" stroke="var(--ds-card-border)" strokeWidth="1" />
      <path d="M120 25 L95 25 L95 0" stroke="var(--ds-input-bg)" strokeWidth="1" />
      {/* Blue header bar */}
      <rect x="12" y="12" width="75" height="6" rx="3" fill="#5B8DBE" />
      {/* Text lines */}
      <rect x="12" y="30" width="96" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="39" width="80" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="48" width="88" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="57" width="60" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="70" width="96" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="79" width="72" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="88" width="90" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="97" width="66" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="110" width="96" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="119" width="50" height="3" rx="1.5" fill="var(--ds-card-border)" />
      {/* DOCX label */}
      <text x="108" y="143" textAnchor="end" fill="#5B8DBE" fontSize="11" fontWeight="700" fontFamily="var(--font-manrope), sans-serif">DOCX</text>
    </svg>
  );
}

function GDocsPreview() {
  return (
    <svg width="120" height="150" viewBox="0 0 120 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="120" height="150" rx="6" fill="var(--ds-input-bg)" stroke="var(--ds-card-border)" strokeWidth="1" />
      <path d="M95 0 L120 25 L95 25 Z" fill="var(--env-bg)" />
      <path d="M95 0 L120 25" stroke="var(--ds-card-border)" strokeWidth="1" />
      <path d="M120 25 L95 25 L95 0" stroke="var(--ds-input-bg)" strokeWidth="1" />
      {/* Amber header bar */}
      <rect x="12" y="12" width="75" height="6" rx="3" fill="#D4A853" />
      {/* Text lines */}
      <rect x="12" y="30" width="96" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="39" width="80" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="48" width="88" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="57" width="60" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="70" width="96" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="79" width="72" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="88" width="90" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="97" width="66" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="110" width="96" height="3" rx="1.5" fill="var(--ds-card-border)" />
      <rect x="12" y="119" width="50" height="3" rx="1.5" fill="var(--ds-card-border)" />
      {/* Colored dots for GDocs */}
      <circle cx="90" cy="140" r="4" fill="#4285F4" />
      <circle cx="100" cy="140" r="4" fill="#EA4335" />
      <circle cx="110" cy="140" r="4" fill="#FBBC05" />
    </svg>
  );
}

function HardcoverPreview() {
  return (
    <svg width="84" height="104" viewBox="0 0 84 104" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Back cover */}
      <rect x="6" y="6" width="72" height="92" rx="5" fill="#8E5A34" />
      {/* Page block */}
      <rect x="12" y="10" width="64" height="84" rx="3" fill="var(--ds-input-bg)" />
      {/* Front cover */}
      <rect x="10" y="2" width="70" height="92" rx="5" fill="#C17A47" />
      {/* Spine shade */}
      <rect x="10" y="2" width="10" height="92" fill="#A9633A" />
      {/* Cover title lines */}
      <rect x="30" y="24" width="40" height="5" rx="2.5" fill="rgba(255,255,255,0.85)" />
      <rect x="30" y="35" width="28" height="4" rx="2" fill="rgba(255,255,255,0.55)" />
      {/* Author line */}
      <rect x="30" y="78" width="24" height="3" rx="1.5" fill="rgba(255,255,255,0.45)" />
    </svg>
  );
}

/* ─── Icons ─── */

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 2v8m0 0l-3-3m3 3l3-3M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 3H3v10h10v-3M9 2h5v5M14 2L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Page ─── */

export default function ExportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [format, setFormat] = useState<"pdf" | "docx">("pdf");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const [isPublic, setIsPublic] = useState(false);
  const [publishedExcerpt, setPublishedExcerpt] = useState("");
  const [publishedAuthor, setPublishedAuthor] = useState("");
  const [publishSaving, setPublishSaving] = useState(false);
  const [publishSaved, setPublishSaved] = useState(false);

  const [hardcoverState, setHardcoverState] = useState<
    "loading" | "idle" | "saving" | "joined"
  >("loading");

  useEffect(() => {
    fetch("/api/feature-interest?feature=hardcover")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setHardcoverState(data?.interested ? "joined" : "idle"))
      .catch(() => setHardcoverState("idle"));
  }, []);

  async function notifyHardcover() {
    if (hardcoverState !== "idle") return;
    setHardcoverState("saving");
    try {
      const res = await fetch("/api/feature-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature: "hardcover", project_id: projectId }),
      });
      setHardcoverState(res.ok ? "joined" : "idle");
    } catch {
      setHardcoverState("idle");
    }
  }

  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setIsPublic(!!data.is_public);
        setPublishedExcerpt(data.published_excerpt || "");
        setPublishedAuthor(data.published_author || "");
      })
      .catch(() => {});
  }, [projectId]);

  async function savePublishSettings() {
    setPublishSaving(true);
    setPublishSaved(false);
    await fetch(`/api/project/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        is_public: isPublic,
        published_excerpt: publishedExcerpt,
        published_author: publishedAuthor,
      }),
    });
    setPublishSaving(false);
    setPublishSaved(true);
  }

  async function handleExport() {
    setExporting(true);
    setExported(false);

    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, format }),
    });

    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dscribe-export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setExported(true);
    }

    setExporting(false);
  }

  function handleCardExport(fmt: "pdf" | "docx") {
    setFormat(fmt);
    // setState is async, so we trigger export with the format directly
    setExporting(true);
    setExported(false);

    fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, format: fmt }),
    }).then(async (res) => {
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `dscribe-export.${fmt}`;
        a.click();
        URL.revokeObjectURL(url);
        setExported(true);
      }
      setExporting(false);
    }).catch(() => {
      setExporting(false);
    });
  }

  const cardBase: React.CSSProperties = {
    background: "var(--ds-card-bg)",
    border: "1px solid var(--ds-card-border)",
    borderRadius: 24,
    padding: 32,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 20,
    cursor: "default",
    transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
  };

  const btnBase: React.CSSProperties = {
    width: "100%",
    padding: "14px 20px",
    borderRadius: 9999,
    border: "none",
    background: "#C17A47",
    color: "var(--text-primary)",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "var(--font-manrope), sans-serif",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transition: "opacity 0.2s",
  };

  return (
    <PageShell projectId={projectId} currentStep="export">
      {/* This page outgrew one viewport (export cards + hardcover teaser + publish
          panel). center + overflow:hidden clipped BOTH ends with no scroll — the
          "mangled" bug. Top-aligned and scrollable is the honest layout now. */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          overflowY: "auto",
          padding: "40px 24px 48px",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: "var(--text-primary)",
              fontFamily: "var(--font-manrope), sans-serif",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Export your masterpiece
          </h1>
          <p
            style={{
              fontSize: 16,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-playfair), serif",
              fontStyle: "italic",
              marginTop: 8,
              margin: "8px 0 0 0",
            }}
          >
            Choose a format and bring your words into the world
          </p>
        </div>

        {/* Cards Grid */}
        <style>{`
          @media (max-width: 768px) {
            .ds-export-grid { grid-template-columns: 1fr !important; max-width: 400px !important; }
            .ds-hardcover-teaser { flex-direction: column !important; text-align: center !important; }
            .ds-hardcover-teaser .ds-hardcover-cta { width: 100% !important; }
          }
        `}</style>
        <div
          className="ds-export-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 24,
            maxWidth: 1000,
            width: "100%",
          }}
        >
          {/* PDF Card */}
          <div
            style={cardBase}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-8px)";
              e.currentTarget.style.borderColor = "#C17A47";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = "var(--ds-card-border)";
            }}
          >
            <PdfPreview />
            <div style={{ textAlign: "center" }}>
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  margin: 0,
                }}
              >
                Portable Document
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  margin: "8px 0 0 0",
                  lineHeight: 1.5,
                }}
              >
                Print-ready PDF with clean typography. Perfect for sharing or archiving.
              </p>
            </div>
            <button
              onClick={() => handleCardExport("pdf")}
              disabled={exporting}
              style={{
                ...btnBase,
                opacity: exporting ? 0.6 : 1,
                marginTop: "auto",
              }}
            >
              <DownloadIcon />
              {exporting && format === "pdf" ? "Exporting..." : "Download .pdf"}
            </button>
          </div>

          {/* DOCX Card */}
          <div
            style={cardBase}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-8px)";
              e.currentTarget.style.borderColor = "#C17A47";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = "var(--ds-card-border)";
            }}
          >
            <DocxPreview />
            <div style={{ textAlign: "center" }}>
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  margin: 0,
                }}
              >
                Microsoft Word
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  margin: "8px 0 0 0",
                  lineHeight: 1.5,
                }}
              >
                Editable Word document. Great for further revisions or submissions.
              </p>
            </div>
            <button
              onClick={() => handleCardExport("docx")}
              disabled={exporting}
              style={{
                ...btnBase,
                opacity: exporting ? 0.6 : 1,
                marginTop: "auto",
              }}
            >
              <DownloadIcon />
              {exporting && format === "docx" ? "Exporting..." : "Download .docx"}
            </button>
          </div>

          {/* Google Docs Card */}
          <div
            style={cardBase}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-8px)";
              e.currentTarget.style.borderColor = "#C17A47";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = "var(--ds-card-border)";
            }}
          >
            <GDocsPreview />
            <div style={{ textAlign: "center" }}>
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  margin: 0,
                }}
              >
                Google Docs
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  margin: "8px 0 0 0",
                  lineHeight: 1.5,
                }}
              >
                Export directly to Google Drive for real-time collaboration.
              </p>
            </div>
            <button
              disabled
              style={{
                ...btnBase,
                opacity: 0.5,
                cursor: "not-allowed",
                marginTop: "auto",
              }}
            >
              <ExternalLinkIcon />
              Export to Drive
            </button>
          </div>
        </div>

        {/* Success toast */}
        {exported && (
          <div
            style={{
              marginTop: 24,
              padding: "14px 28px",
              background: "rgba(52,211,153,0.1)",
              border: "1px solid rgba(5,150,105,0.2)",
              borderRadius: 9999,
              fontSize: 14,
              fontWeight: 500,
              color: "#34D399",
              fontFamily: "var(--font-manrope), sans-serif",
              textAlign: "center",
            }}
          >
            Export complete — your manuscript is ready to share.
          </div>
        )}

        {/* Hardcover coming-soon teaser */}
        <div
          className="ds-hardcover-teaser"
          style={{
            marginTop: 40,
            maxWidth: 1000,
            width: "100%",
            background: "var(--ds-card-bg)",
            border: "1px solid var(--ds-card-border)",
            borderRadius: 24,
            padding: 32,
            display: "flex",
            alignItems: "center",
            gap: 28,
            boxSizing: "border-box" as const,
          }}
        >
          <HardcoverPreview />
          <div style={{ flex: 1 }}>
            <span
              style={{
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase" as const,
                fontFamily: "var(--font-manrope), sans-serif",
                background: "rgba(193,122,71,0.12)",
                border: "1px solid rgba(193,122,71,0.3)",
                color: "#C17A47",
              }}
            >
              Coming soon
            </span>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
                fontFamily: "var(--font-manrope), sans-serif",
                margin: "10px 0 0 0",
              }}
            >
              Hardcover copies, printed and delivered
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                fontFamily: "var(--font-manrope), sans-serif",
                margin: "6px 0 0 0",
                lineHeight: 1.5,
              }}
            >
              Order bound copies of your finished book, shipped to your door or
              sent as a gift. Tap notify and you&apos;ll be the first to know when
              it opens.
            </p>
          </div>
          <button
            className="ds-hardcover-cta"
            onClick={notifyHardcover}
            disabled={hardcoverState !== "idle"}
            style={{
              padding: "14px 28px",
              minHeight: 44,
              borderRadius: 9999,
              border:
                hardcoverState === "joined"
                  ? "1px solid rgba(52,211,153,0.3)"
                  : "none",
              background:
                hardcoverState === "joined"
                  ? "rgba(52,211,153,0.12)"
                  : "#C17A47",
              color:
                hardcoverState === "joined" ? "#34d399" : "var(--text-primary)",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "var(--font-manrope), sans-serif",
              cursor:
                hardcoverState === "idle"
                  ? "pointer"
                  : hardcoverState === "joined"
                    ? "default"
                    : "wait",
              whiteSpace: "nowrap" as const,
              flexShrink: 0,
              transition: "opacity 0.2s",
              opacity: hardcoverState === "loading" ? 0.6 : 1,
            }}
          >
            {hardcoverState === "joined"
              ? "You're on the list"
              : hardcoverState === "saving"
                ? "Saving..."
                : "Notify me"}
          </button>
        </div>

        {/* Publish to Community */}
        <div
          style={{
            marginTop: 40,
            maxWidth: 1000,
            width: "100%",
            background: "var(--ds-card-bg)",
            border: "1px solid var(--ds-card-border)",
            borderRadius: 24,
            padding: 32,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  margin: 0,
                }}
              >
                Publish to Community
              </h2>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  marginTop: 4,
                  margin: "4px 0 0 0",
                }}
              >
                Share your book with other D. scribe readers on the community gallery.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  padding: "4px 12px",
                  borderRadius: 9999,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "var(--font-manrope), sans-serif",
                  background: isPublic ? "rgba(52,211,153,0.12)" : "rgba(168,159,148,0.12)",
                  border: isPublic ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(168,159,148,0.2)",
                  color: isPublic ? "#34d399" : "var(--text-secondary)",
                }}
              >
                {isPublic ? "Published" : "Private"}
              </span>
              <button
                onClick={() => setIsPublic(!isPublic)}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  border: "none",
                  cursor: "pointer",
                  background: isPublic ? "#C17A47" : "var(--ds-input-border, rgba(168,159,148,0.3))",
                  position: "relative",
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "white",
                    position: "absolute",
                    top: 3,
                    left: isPublic ? 23 : 3,
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  marginBottom: 8,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase" as const,
                }}
              >
                Display Name
              </label>
              <input
                type="text"
                value={publishedAuthor}
                onChange={(e) => setPublishedAuthor(e.target.value)}
                placeholder="e.g. Marcus T."
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: "1px solid var(--ds-card-border)",
                  background: "var(--ds-input-bg)",
                  color: "var(--text-primary)",
                  fontSize: 16,
                  fontFamily: "var(--font-manrope), sans-serif",
                  outline: "none",
                  boxSizing: "border-box" as const,
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  marginBottom: 8,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase" as const,
                }}
              >
                Short Excerpt{" "}
                <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  ({publishedExcerpt.length}/300)
                </span>
              </label>
              <textarea
                value={publishedExcerpt}
                onChange={(e) => setPublishedExcerpt(e.target.value.slice(0, 300))}
                placeholder="A short blurb that will appear in the community gallery..."
                rows={4}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: "1px solid var(--ds-card-border)",
                  background: "var(--ds-input-bg)",
                  color: "var(--text-primary)",
                  fontSize: 16,
                  fontFamily: "var(--font-lora), var(--font-playfair), serif",
                  fontStyle: "italic",
                  outline: "none",
                  resize: "vertical",
                  lineHeight: 1.6,
                  boxSizing: "border-box" as const,
                }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={savePublishSettings}
                disabled={publishSaving}
                style={{
                  padding: "12px 28px",
                  borderRadius: 9999,
                  border: "none",
                  background: "#C17A47",
                  color: "var(--text-primary)",
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "var(--font-manrope), sans-serif",
                  cursor: publishSaving ? "wait" : "pointer",
                  opacity: publishSaving ? 0.7 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                {publishSaving ? "Saving..." : "Save"}
              </button>
              {publishSaved && !publishSaving && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#34d399",
                    fontFamily: "var(--font-manrope), sans-serif",
                  }}
                >
                  Saved
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            marginTop: 32,
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 13,
            color: "var(--text-secondary)",
            fontFamily: "var(--font-manrope), sans-serif",
          }}
        >
          <span>
            Current Project: <span style={{ color: "var(--text-primary)" }}>{projectId}</span>
          </span>
          <span style={{ color: "var(--ds-card-border)" }}>|</span>
          <Link
            href={`/project/${projectId}/write`}
            style={{
              color: "#C17A47",
              textDecoration: "none",
              fontWeight: 500,
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            Back to Editor
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
