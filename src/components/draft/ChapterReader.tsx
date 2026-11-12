"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { parseBlocks, type Run } from "@/lib/export/format-markers";

export interface ReaderChapter { id: string; chapter_number: number; title: string; status: string }

const READABLE = new Set(["generated", "edited"]);
export const isReadable = (c: { status: string }) => READABLE.has(c.status);

function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, i) => {
        let node: React.ReactNode = r.text;
        if (r.italic) node = <em>{node}</em>;
        if (r.bold) node = <strong>{node}</strong>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

/**
 * Side pane for reading finished chapters on the draft pages (flow v2, Kyle
 * 9/28: "once a chapter has been generated, it's readable on a side pane").
 * Desktop: a right-hand panel that leaves the page usable. Phone: full-screen
 * sheet with a back button, so it works as the Read tab next to Progress.
 * Only whole chapters are ever shown, never text mid-generation.
 */
export default function ChapterReader({
  chapters, openId, onOpen, onClose, refreshKey = 0,
}: {
  chapters: ReaderChapter[];
  openId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  /** Bump to re-fetch the open chapter (e.g. after a revision lands). */
  refreshKey?: number;
}) {
  const [content, setContent] = useState<{ id: string; key: number; text: string; words: number } | null>(null);

  useEffect(() => {
    if (!openId) return;
    let alive = true;
    fetch(`/api/chapter-content/${openId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        const text: string = d?.content ?? "";
        setContent({ id: openId, key: refreshKey, text, words: d?.word_count ?? text.split(/\s+/).filter(Boolean).length });
      })
      .catch(() => { if (alive) setContent({ id: openId, key: refreshKey, text: "", words: 0 }); });
    return () => { alive = false; };
  }, [openId, refreshKey]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, onClose]);

  // Client-only portal; openId is always null on the server render.
  if (!openId || typeof document === "undefined") return null;
  const ch = chapters.find((c) => c.id === openId);
  const readable = chapters.filter(isReadable);
  const pos = readable.findIndex((c) => c.id === openId);
  const prev = pos > 0 ? readable[pos - 1] : null;
  const next = pos >= 0 && pos < readable.length - 1 ? readable[pos + 1] : null;
  const blocks = content?.id === openId ? parseBlocks(content.text) : [];

  const navBtn = (label: string, target: ReaderChapter | null) => (
    <button type="button" disabled={!target} onClick={() => target && onOpen(target.id)} style={{
      fontSize: 13, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--ds-card-border)", background: "transparent",
      color: "var(--text-primary)", cursor: target ? "pointer" : "default", opacity: target ? 1 : 0.35,
    }}>{label}</button>
  );

  return createPortal(
    // paper-theme: the portal sits outside the page wrapper that carries the light tokens.
    <aside className="ds-reader-pane paper-theme" aria-label={`Reading chapter ${ch?.chapter_number ?? ""}`}>
      <style>{`
        .ds-reader-pane {
          position: fixed; top: 0; right: 0; bottom: 0; z-index: 150;
          width: min(560px, 46vw); display: flex; flex-direction: column;
          background: var(--ds-paper, #FDFCF8); border-left: 1px solid var(--ds-card-border);
          box-shadow: -18px 0 50px rgba(44,36,25,0.18); animation: dsReaderIn 0.25s ease;
        }
        @keyframes dsReaderIn { from { transform: translateX(24px); opacity: 0 } to { transform: none; opacity: 1 } }
        @media (max-width: 820px) {
          .ds-reader-pane { width: 100%; border-left: none; padding-top: env(safe-area-inset-top); }
          .ds-reader-chrome { flex-wrap: wrap; padding: 8px 12px; row-gap: 8px; }
          .ds-reader-chrome button { min-height: 44px; min-width: 44px; padding: 8px 14px; }
        }
      `}</style>
      <div className="ds-reader-chrome" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "14px 18px", borderBottom: "1px solid var(--ds-card-border)" }}>
        <button type="button" onClick={onClose} aria-label="Back to progress" style={{
          fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 8, border: "none", background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
        }}>← Back</button>
        <div style={{ display: "flex", gap: 6 }}>
          {navBtn("‹ Prev", prev)}
          {navBtn("Next ›", next)}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "28px clamp(18px, 4vw, 40px) 60px" }}>
        <div className="ds-stamp" style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
          Chapter {ch?.chapter_number}{content?.id === openId && content.words ? ` · ${content.words.toLocaleString()} words` : ""}
        </div>
        <h2 style={{ fontFamily: "var(--font-lora), serif", fontSize: 26, fontWeight: 500, color: "var(--text-primary)", margin: "8px 0 22px" }}>
          {ch?.title}
        </h2>
        {content?.id !== openId ? (
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Opening the chapter…</p>
        ) : !blocks.length ? (
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Nothing written for this chapter yet.</p>
        ) : (
          <div style={{ fontFamily: "var(--font-lora), serif", fontSize: 17, lineHeight: 1.75, color: "var(--text-primary)" }}>
            {blocks.map((b, i) => {
              if (b.kind === "break") return <div key={i} style={{ textAlign: "center", margin: "24px 0", color: "var(--text-tertiary)" }}>* * *</div>;
              if (b.kind === "heading") {
                const H = b.level === 2 ? "h3" : "h4";
                return <H key={i} style={{ fontSize: b.level === 2 ? 20 : 17, fontWeight: 600, margin: "26px 0 10px" }}><Runs runs={b.runs} /></H>;
              }
              if (b.kind === "quote") {
                return (
                  <blockquote key={i} style={{ margin: "18px 0", padding: "0 2em", fontStyle: "italic", color: "var(--text-secondary)" }}>
                    {b.paragraphs.map((p, j) => <p key={j} style={{ margin: "0 0 10px" }}><Runs runs={p} /></p>)}
                  </blockquote>
                );
              }
              return <p key={i} style={{ margin: "0 0 16px" }}><Runs runs={b.runs} /></p>;
            })}
          </div>
        )}
      </div>
    </aside>,
    document.body,
  );
}
