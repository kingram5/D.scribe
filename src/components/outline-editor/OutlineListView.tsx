"use client";

import { useState } from "react";
import type { Chapter, KeyPoint } from "@/types";
import type { EditorAction } from "./useOutlineState";

// Phone outline (Kyle's pick, 2026-09-29): a plain list of chapters and their key
// points instead of the sticky-note canvas. Everything the canvas does is still
// here, as buttons instead of drags:
//   canvas drag chapter      -> Move up / Move down
//   canvas drop chapter on   -> Merge into the chapter above
//   canvas drag key point    -> Up / Down, or "Move to" another chapter
//   canvas drop key point on -> Merge into the key point above
//   title edit, delete, + key point, + chapter, undo/redo stay as they were
// Titles save on blur, exactly like the canvas notes.

interface Props {
  chapters: Chapter[];
  keyPoints: KeyPoint[];
  dispatch: (action: EditorAction) => void;
}

const INK = "#2C2419";
const MUTED = "#716A53";
const ACCENT = "#A05526";

const iconBtn: React.CSSProperties = {
  minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
  gap: 6, padding: "0 10px", borderRadius: 10, border: "1px solid rgba(44,36,25,0.14)",
  background: "rgba(255,255,255,0.6)", color: INK, fontSize: 13, fontWeight: 600,
  fontFamily: "var(--font-manrope), sans-serif", cursor: "pointer",
};

function TitleInput({ value, onCommit, label, big }: { value: string; onCommit: (v: string) => void; label: string; big?: boolean }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const shown = focused ? draft : value;
  return (
    <input
      aria-label={label}
      value={shown}
      onFocus={() => { setDraft(value); setFocused(true); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setFocused(false); if (draft !== value) onCommit(draft); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      style={{
        flex: 1, minWidth: 0, minHeight: 44, padding: "8px 10px", borderRadius: 8,
        border: "1px solid rgba(44,36,25,0.12)", background: "rgba(255,255,255,0.75)",
        color: INK, fontSize: big ? 17 : 15, fontWeight: big ? 600 : 500,
        fontFamily: big ? "var(--font-playfair), var(--font-lora), serif" : "var(--font-manrope), sans-serif",
        boxSizing: "border-box",
      }}
    />
  );
}

export function OutlineListView({ chapters, keyPoints, dispatch }: Props) {
  const sorted = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);
  const kpById = new Map(keyPoints.map((kp) => [kp.id, kp]));

  function moveChapter(idx: number, dir: -1 | 1) {
    const ids = sorted.map((c) => c.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    dispatch({ type: "REORDER_CHAPTERS", orderedIds: ids });
  }

  return (
    <div className="ds-outline-list" style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 150 }}>
      {sorted.map((ch, idx) => {
        const kps = ch.key_point_ids.map((id) => kpById.get(id)).filter(Boolean) as KeyPoint[];
        const prev = idx > 0 ? sorted[idx - 1] : null;
        return (
          <section
            key={ch.id}
            aria-label={`Chapter ${ch.chapter_number}`}
            style={{ background: "#fdf8ec", border: "1px solid rgba(44,36,25,0.12)", borderRadius: 12, padding: 14 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, fontWeight: 700, color: ACCENT, flexShrink: 0 }}>
                CH {ch.chapter_number}
              </span>
              <TitleInput
                big
                label={`Chapter ${ch.chapter_number} title`}
                value={ch.title}
                onCommit={(v) => dispatch({ type: "EDIT_CHAPTER", chapterId: ch.id, field: "title", value: v })}
              />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              <button type="button" style={iconBtn} disabled={idx === 0} aria-label={`Move chapter ${ch.chapter_number} up`} onClick={() => moveChapter(idx, -1)}>↑</button>
              <button type="button" style={iconBtn} disabled={idx === sorted.length - 1} aria-label={`Move chapter ${ch.chapter_number} down`} onClick={() => moveChapter(idx, 1)}>↓</button>
              {prev && (
                <button
                  type="button"
                  style={iconBtn}
                  onClick={() => {
                    if (window.confirm(`Merge "${ch.title}" into "${prev.title}"? Their key points combine into one chapter.`)) {
                      dispatch({ type: "COMBINE_CHAPTERS", targetId: prev.id, sourceId: ch.id });
                    }
                  }}
                >
                  Merge up
                </button>
              )}
              <button
                type="button"
                style={{ ...iconBtn, color: "#B03A2E" }}
                onClick={() => {
                  if (window.confirm(`Delete chapter "${ch.title}"?`)) dispatch({ type: "DELETE_CHAPTER", chapterId: ch.id });
                }}
              >
                Delete
              </button>
            </div>

            <ol style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {kps.map((kp, k) => (
                <li key={kp.id} style={{ borderTop: "1px solid rgba(44,36,25,0.08)", paddingTop: 10 }}>
                  <TitleInput
                    label={`Key point ${k + 1} in chapter ${ch.chapter_number}`}
                    value={kp.title}
                    onCommit={(v) => dispatch({ type: "EDIT_KEY_POINT", keyPointId: kp.id, field: "title", value: v })}
                  />
                  {kp.summary && (
                    <p style={{ margin: "6px 2px 0", fontSize: 13, lineHeight: 1.45, color: MUTED }}>{kp.summary}</p>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    <button
                      type="button" style={iconBtn} disabled={k === 0} aria-label={`Move key point "${kp.title}" up`}
                      onClick={() => dispatch({ type: "REORDER_KEY_POINT", chapterId: ch.id, keyPointId: kp.id, newIndex: k - 1 })}
                    >↑</button>
                    <button
                      type="button" style={iconBtn} disabled={k === kps.length - 1} aria-label={`Move key point "${kp.title}" down`}
                      onClick={() => dispatch({ type: "REORDER_KEY_POINT", chapterId: ch.id, keyPointId: kp.id, newIndex: k + 1 })}
                    >↓</button>
                    {sorted.length > 1 && (
                      <select
                        aria-label={`Move key point "${kp.title}" to another chapter`}
                        value=""
                        onChange={(e) => {
                          const to = e.target.value;
                          if (to) dispatch({ type: "MOVE_KEY_POINT", keyPointId: kp.id, fromChapterId: ch.id, toChapterId: to });
                        }}
                        style={{ ...iconBtn, fontWeight: 500, maxWidth: 170 }}
                      >
                        <option value="">Move to…</option>
                        {sorted.filter((c) => c.id !== ch.id).map((c) => (
                          <option key={c.id} value={c.id}>Ch {c.chapter_number}: {c.title}</option>
                        ))}
                      </select>
                    )}
                    {k > 0 && (
                      <button
                        type="button" style={iconBtn}
                        onClick={() => {
                          const above = kps[k - 1];
                          if (window.confirm(`Merge "${kp.title}" into "${above.title}"?`)) {
                            dispatch({ type: "COMBINE_KEY_POINTS", targetId: above.id, sourceId: kp.id });
                          }
                        }}
                      >
                        Merge up
                      </button>
                    )}
                    <button
                      type="button" style={{ ...iconBtn, color: "#B03A2E" }} aria-label={`Delete key point "${kp.title}"`}
                      onClick={() => dispatch({ type: "DELETE_KEY_POINT", keyPointId: kp.id })}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ol>

            <button
              type="button"
              style={{ ...iconBtn, marginTop: 12, width: "100%", borderStyle: "dashed", color: ACCENT }}
              onClick={() => dispatch({ type: "ADD_KEY_POINT", chapterId: ch.id })}
            >
              + Key point
            </button>
          </section>
        );
      })}
      {sorted.length === 0 && (
        <p style={{ color: MUTED, fontSize: 14, textAlign: "center" }}>No chapters yet. Add one with the + button below.</p>
      )}
    </div>
  );
}
