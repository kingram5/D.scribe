"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import GlassCard from "@/components/ui/GlassCard";
import PanelTitle from "@/components/ui/PanelTitle";
import PageShell from "@/components/ui/PageShell";

export default function ExportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [format, setFormat] = useState<"pdf" | "docx">("pdf");
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);

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
    }

    setExporting(false);
  }

  return (
    <PageShell projectId={projectId} currentStep="export">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 24px" }}>
        <GlassCard style={{ maxWidth: 440, width: "100%", padding: 48 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "#191816", marginBottom: 8 }}>
            Export
          </h1>
          <p style={{ fontSize: 14, color: "#7a7369", marginBottom: 32 }}>
            Export your manuscript as a formatted document.
          </p>

          <div style={{ marginBottom: 24 }}>
            <PanelTitle>Format</PanelTitle>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                onClick={() => setFormat("pdf")}
                style={{
                  flex: 1,
                  padding: "14px 16px",
                  borderRadius: "var(--radius-pill)",
                  border: "none",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  background: format === "pdf" ? "#E05D3A" : "rgba(255,255,255,0.5)",
                  color: format === "pdf" ? "white" : "#191816",
                  boxShadow: format === "pdf" ? "var(--shadow-btn)" : "none",
                }}
              >
                PDF
              </button>
              <button
                onClick={() => setFormat("docx")}
                style={{
                  flex: 1,
                  padding: "14px 16px",
                  borderRadius: "var(--radius-pill)",
                  border: "none",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  background: format === "docx" ? "#E05D3A" : "rgba(255,255,255,0.5)",
                  color: format === "docx" ? "white" : "#191816",
                  boxShadow: format === "docx" ? "var(--shadow-btn)" : "none",
                }}
              >
                Word (DOCX)
              </button>
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="nodum-btn"
            style={{ width: "100%", justifyContent: "center" }}
          >
            {exporting ? "Exporting..." : `Download ${format.toUpperCase()}`}
          </button>
        </GlassCard>
      </div>
    </PageShell>
  );
}
