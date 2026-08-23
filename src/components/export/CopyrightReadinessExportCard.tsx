"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BAND_LABELS,
  DISCLAIMER_LINE,
  type BookReadiness,
  type ReadinessBand,
} from "@/lib/copyright-readiness";

function bandColor(band: ReadinessBand): string {
  if (band === "mostly_yours") return "var(--ds-score-good)";
  if (band === "mixed") return "var(--ds-score-warn)";
  return "var(--ds-score-bad)";
}

function copyText(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

function downloadTxt(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CopyrightReadinessExportCard({
  projectId,
  bookTitle,
}: {
  projectId: string;
  bookTitle: string;
}) {
  const [report, setReport] = useState<BookReadiness | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [office, setOffice] = useState("");
  const [kdp, setKdp] = useState("");
  const [copied, setCopied] = useState<"office" | "kdp" | null>(null);
  const [evidenceState, setEvidenceState] = useState<"idle" | "working" | "done" | "error">("idle");

  const loadReport = useCallback(async () => {
    try {
      const res = await fetch("/api/copyright-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || "Couldn't load Copyright Readiness");
        return;
      }
      setReport(data as BookReadiness);
      setLoadError(null);
    } catch {
      setLoadError("Couldn't load Copyright Readiness");
    }
  }, [projectId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  async function draftDisclosures() {
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch("/api/copyright-readiness/disclosure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDraftError(data.message || data.error || "Couldn't draft disclosures");
        return;
      }
      setOffice(data.copyrightOfficeStatement || "");
      setKdp(data.kdpAnswer || "");
    } catch {
      setDraftError("Couldn't draft disclosures");
    } finally {
      setDrafting(false);
    }
  }

  function handleCopy(which: "office" | "kdp") {
    const text = which === "office" ? office : kdp;
    if (!text) return;
    void copyText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  async function downloadEvidence() {
    setEvidenceState("working");
    try {
      const res = await fetch("/api/export/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) {
        setEvidenceState("error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ascii = (bookTitle || "manuscript").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
      a.download = `${ascii || "manuscript"}-authorship-evidence.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setEvidenceState("done");
    } catch {
      setEvidenceState("error");
    }
  }

  function handleDownload() {
    const title = bookTitle || "manuscript";
    const body = [
      `Copyright Readiness disclosures — ${title}`,
      `Generated ${new Date().toISOString().slice(0, 10)}`,
      DISCLAIMER_LINE,
      "",
      "— U.S. Copyright Office statement —",
      office,
      "",
      "— Amazon KDP AI-content answer —",
      kdp,
      "",
    ].join("\n");
    const ascii = title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "manuscript";
    downloadTxt(`${ascii}-disclosures.txt`, body);
  }

  const btn: React.CSSProperties = {
    padding: "12px 20px",
    borderRadius: 9999,
    border: "none",
    background: "#C17A47",
    color: "var(--text-primary)",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "var(--font-manrope), sans-serif",
    cursor: "pointer",
  };

  const ghost: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 9999,
    border: "1px solid var(--ds-card-border)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "var(--font-manrope), sans-serif",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        marginBottom: 32,
        maxWidth: 1000,
        width: "100%",
        background: "var(--ds-card-bg)",
        border: "1px solid var(--ds-card-border)",
        borderRadius: 24,
        padding: 32,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
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
            Copyright Readiness
          </h2>
          {report ? (
            <p
              style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                fontFamily: "var(--font-manrope), sans-serif",
                margin: "8px 0 0",
              }}
            >
              <span style={{ color: bandColor(report.band), fontWeight: 700 }}>
                {BAND_LABELS[report.band]}
              </span>
              {" · "}
              {report.thinChapters.length === 0
                ? "no unedited-AI chapters"
                : `${report.thinChapters.length} chapter${report.thinChapters.length === 1 ? "" : "s"} still mostly unedited AI draft`}
            </p>
          ) : (
            <p
              style={{
                fontSize: 13,
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-manrope), sans-serif",
                margin: "8px 0 0",
              }}
            >
              {loadError || "Scoring authorship…"}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={draftDisclosures} disabled={drafting} style={{ ...btn, opacity: drafting ? 0.7 : 1 }}>
            {drafting ? "Drafting…" : office ? "Redraft my disclosures" : "Draft my disclosures"}
          </button>
          <button
            onClick={downloadEvidence}
            disabled={evidenceState === "working"}
            style={{ ...btn, background: "transparent", border: "1px solid #C17A47", color: "#C17A47", opacity: evidenceState === "working" ? 0.7 : 1 }}
          >
            {evidenceState === "working"
              ? "Building…"
              : evidenceState === "done"
                ? "Download evidence again"
                : "Download evidence bundle"}
          </button>
        </div>
      </div>

      <p
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-manrope), sans-serif",
          margin: "12px 0 0",
        }}
      >
        {DISCLAIMER_LINE}
      </p>

      {draftError && (
        <p style={{ fontSize: 13, color: "var(--ds-score-bad)", margin: "12px 0 0" }}>{draftError}</p>
      )}
      {evidenceState === "error" && (
        <p style={{ fontSize: 13, color: "var(--ds-score-bad)", margin: "12px 0 0" }}>
          Couldn&apos;t build the evidence bundle. Try again.
        </p>
      )}

      {(office || kdp) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
          <DisclosureBlock
            label="U.S. Copyright Office statement"
            text={office}
            copied={copied === "office"}
            onCopy={() => handleCopy("office")}
            ghost={ghost}
          />
          <DisclosureBlock
            label="Amazon KDP AI-content answer"
            text={kdp}
            copied={copied === "kdp"}
            onCopy={() => handleCopy("kdp")}
            ghost={ghost}
          />
          <button onClick={handleDownload} style={{ ...ghost, alignSelf: "flex-start" }}>
            Download .txt
          </button>
        </div>
      )}
    </div>
  );
}

function DisclosureBlock({
  label,
  text,
  copied,
  onCopy,
  ghost,
}: {
  label: string;
  text: string;
  copied: boolean;
  onCopy: () => void;
  ghost: React.CSSProperties;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-secondary)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
        <button onClick={onCopy} style={ghost} disabled={!text}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <textarea
        readOnly
        value={text}
        rows={6}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: 10,
          border: "1px solid var(--ds-card-border)",
          background: "var(--ds-input-bg)",
          color: "var(--text-primary)",
          fontSize: 16,
          fontFamily: "var(--font-lora), serif",
          lineHeight: 1.55,
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}
