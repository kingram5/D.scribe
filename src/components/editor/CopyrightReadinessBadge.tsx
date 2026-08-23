"use client";

import { useEffect, useRef, useState } from "react";
import {
  BAND_LABELS,
  COPYRIGHT_GUIDANCE_URL,
  DISCLAIMER_LINE,
  FIRST_OPEN_MODAL_TEXT,
  THIN_CHAPTER_PROMPT,
  type BookReadiness,
  type ReadinessBand,
} from "@/lib/copyright-readiness";

const STORAGE_PREFIX = "dscribe:copyright-readiness-modal:";

function bandColor(band: ReadinessBand): string {
  if (band === "mostly_yours") return "var(--ds-score-good)";
  if (band === "mixed") return "var(--ds-score-warn)";
  return "var(--ds-score-bad)";
}

function modalKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

function wasModalDismissed(projectId: string): boolean {
  try {
    return localStorage.getItem(modalKey(projectId)) === "1";
  } catch {
    return false;
  }
}

function dismissModal(projectId: string): void {
  try {
    localStorage.setItem(modalKey(projectId), "1");
  } catch {
    /* storage blocked */
  }
}

/**
 * Copyright Readiness chip for the editor stats bar. Sibling of Voice-Match —
 * different metric, different route, no shared numbers. Book-level band;
 * click opens the per-chapter panel. Advisory, dismissible, never blocking.
 */
export default function CopyrightReadinessBadge({ projectId }: { projectId: string }) {
  const [report, setReport] = useState<BookReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReport(null);
    setError(null);
    setPanelOpen(false);
    setModalOpen(false);
  }, [projectId]);

  useEffect(() => {
    if (!panelOpen) return;
    const onClick = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    document.addEventListener("pointerdown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen]);

  async function load(andOpen: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/copyright-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't score authorship");
        return;
      }
      setReport(data as BookReadiness);
      if (andOpen) {
        if (!wasModalDismissed(projectId)) setModalOpen(true);
        else setPanelOpen(true);
      }
    } catch {
      setError("Couldn't score authorship");
    } finally {
      setLoading(false);
    }
  }

  function handleChipClick() {
    if (loading) return;
    if (panelOpen) {
      setPanelOpen(false);
      return;
    }
    if (report) {
      if (!wasModalDismissed(projectId)) setModalOpen(true);
      else setPanelOpen((o) => !o);
      return;
    }
    void load(true);
  }

  function acknowledgeModal() {
    dismissModal(projectId);
    setModalOpen(false);
    setPanelOpen(true);
  }

  const chipStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    fontFamily: "var(--font-geist-mono), monospace",
  };

  return (
    <div ref={rootRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        onClick={handleChipClick}
        disabled={loading}
        title="Copyright Readiness — D.Scribe's own metric, not a legal assessment"
        aria-label={
          report
            ? `Copyright Readiness: ${BAND_LABELS[report.band]}. Show chapter breakdown`
            : "Score Copyright Readiness"
        }
        aria-expanded={panelOpen}
        aria-haspopup="dialog"
        style={chipStyle}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        {report ? (
          <>
            <span style={{ fontSize: 12, fontWeight: 600, color: bandColor(report.band) }}>
              {BAND_LABELS[report.band]}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-manrope), sans-serif" }}>
              authorship
            </span>
          </>
        ) : (
          <span style={{ fontSize: 11, color: loading ? "var(--text-tertiary)" : "var(--text-secondary)", fontFamily: "var(--font-manrope), sans-serif" }}>
            {loading ? "authorship…" : error ? "retry authorship" : "authorship"}
          </span>
        )}
      </button>

      {panelOpen && report && (
        <div
          role="dialog"
          aria-label="Copyright Readiness"
          style={{
            position: "absolute",
            top: "calc(100% + 12px)",
            right: 0,
            zIndex: "var(--z-dropdown)",
            width: 300,
            padding: "12px 14px",
            borderRadius: 12,
            background: "var(--ds-card-bg)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid var(--ds-card-border)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
            fontFamily: "var(--font-manrope), sans-serif",
            fontSize: 11,
            color: "var(--text-secondary)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 12 }}>
                Copyright Readiness
              </div>
              <div style={{ color: bandColor(report.band), fontWeight: 600, marginTop: 2 }}>
                {BAND_LABELS[report.band]}
              </div>
            </div>
            <button
              onClick={() => setPanelOpen(false)}
              aria-label="Close Copyright Readiness panel"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-tertiary)",
                cursor: "pointer",
                padding: 2,
                lineHeight: 1,
                fontSize: 16,
              }}
            >
              ×
            </button>
          </div>

          {report.chapters.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              {report.chapters.map((ch) => (
                <div
                  key={ch.chapterId || ch.chapterNumber}
                  title={`Chapter ${ch.chapterNumber}: ${BAND_LABELS[ch.band]}`}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 5,
                    background: bandColor(ch.band),
                    color: "#1a1a1a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: "var(--font-geist-mono), monospace",
                  }}
                >
                  {ch.chapterNumber}
                </div>
              ))}
              {report.unscoredChapters.map((n) => (
                <div
                  key={`u-${n}`}
                  title={`Chapter ${n}: not scored yet`}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 5,
                    background: "var(--ds-card-border)",
                    color: "var(--text-tertiary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: "var(--font-geist-mono), monospace",
                  }}
                >
                  {n}
                </div>
              ))}
            </div>
          )}

          {report.thinChapters.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
              {report.thinChapters.map((n) => (
                <div key={n} style={{ color: "var(--ds-score-bad)", lineHeight: 1.4 }}>
                  {THIN_CHAPTER_PROMPT(n)}
                </div>
              ))}
            </div>
          ) : report.chapters.length > 0 ? (
            <div style={{ marginBottom: 10, color: "var(--text-secondary)" }}>
              No chapter is still an unedited AI draft.
            </div>
          ) : (
            <div style={{ marginBottom: 10, color: "var(--text-secondary)" }}>
              Generate a chapter to see where the book is still unedited AI draft.
            </div>
          )}

          {report.unscoredChapters.length > 0 && (
            <div style={{ marginBottom: 10, color: "var(--text-tertiary)" }}>
              Not scored yet: chapter{report.unscoredChapters.length > 1 ? "s" : ""}{" "}
              {report.unscoredChapters.join(", ")}
            </div>
          )}

          <div
            style={{
              marginTop: 4,
              paddingTop: 8,
              borderTop: "1px solid var(--ds-card-border)",
              color: "var(--text-tertiary)",
              lineHeight: 1.4,
            }}
          >
            {DISCLAIMER_LINE}
          </div>

          <button
            onClick={() => void load(false)}
            disabled={loading}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "5px 0",
              borderRadius: 8,
              border: "1px solid var(--ds-card-border)",
              background: "none",
              color: "var(--text-secondary)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {loading ? "rescoring…" : "rescore"}
          </button>
        </div>
      )}

      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: "var(--z-modal)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
          }}
          onClick={acknowledgeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="copyright-readiness-modal-title"
            style={{
              background: "var(--ds-card-bg)",
              border: "1px solid var(--ds-card-border)",
              borderRadius: 16,
              padding: "28px 24px",
              maxWidth: 440,
              width: "90%",
              boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
              fontFamily: "var(--font-manrope), sans-serif",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              id="copyright-readiness-modal-title"
              style={{
                fontWeight: 700,
                color: "var(--text-primary)",
                fontSize: 16,
                marginBottom: 12,
              }}
            >
              Copyright Readiness
            </div>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                color: "var(--text-secondary)",
                margin: "0 0 16px",
              }}
            >
              {FIRST_OPEN_MODAL_TEXT}
            </p>
            <a
              href={COPYRIGHT_GUIDANCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 13, color: "#C17A47", fontWeight: 600 }}
            >
              U.S. Copyright Office AI guidance
            </a>
            <button
              onClick={acknowledgeModal}
              style={{
                display: "block",
                width: "100%",
                marginTop: 20,
                padding: "12px 16px",
                borderRadius: 9999,
                border: "none",
                background: "#C17A47",
                color: "var(--text-primary)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              I understand
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
