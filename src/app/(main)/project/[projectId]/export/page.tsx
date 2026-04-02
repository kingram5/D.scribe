"use client";

import { useState } from "react";
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
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          padding: 24,
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
