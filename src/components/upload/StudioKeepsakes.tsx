"use client";

import { useEffect, useRef, useState } from "react";

export interface StudioChip { id: string; chip: string }

/**
 * What the author sees of Theo's notebook, and only this much of it:
 *  - KEEPER LINES: their own sentences, verbatim, pinned as they say them. These
 *    are string-checked against the transcript on the server, so nothing here
 *    is ever a paraphrase. The chapter writer must quote them exactly or leave
 *    them out. It is the promise of the product made visible: we are keeping
 *    your voice.
 *  - CHIPS: plain-language marks of what the book has gained so far.
 * Threads, directives and pacing stay private.
 *
 * Quiet by design. It never takes focus, never covers the question, collapses
 * to a small pill on narrow screens, and announces new lines politely.
 */
export default function StudioKeepsakes({ keeperLines, chips }: { keeperLines: string[]; chips: StudioChip[] }) {
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const total = keeperLines.length + chips.length;

  // Flag the newest arrival for a moment so the author notices it land.
  useEffect(() => {
    const incoming = [...keeperLines, ...chips.map((c) => `chip:${c.id}`)].filter((k) => !seen.current.has(k));
    if (incoming.length === 0) return;
    const firstRun = seen.current.size === 0 && incoming.length > 1;
    incoming.forEach((k) => seen.current.add(k));
    if (firstRun) return; // restoring a session is not news
    setFresh(incoming[incoming.length - 1]);
    const t = setTimeout(() => setFresh(null), 4200);
    return () => clearTimeout(t);
  }, [keeperLines, chips]);

  if (total === 0) return null;

  const newest = keeperLines[0];

  return (
    <aside className={`ds-keepsakes${open ? " is-open" : ""}`} aria-label="What your book has gained so far">
      <button
        type="button"
        className="ds-keepsakes-pill"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ds-keepsakes-dot" data-fresh={fresh ? "true" : "false"} aria-hidden="true" />
        <span>{keeperLines.length > 0 ? `${keeperLines.length} line${keeperLines.length === 1 ? "" : "s"} kept` : "Your book so far"}</span>
        <span aria-hidden="true" className="ds-keepsakes-caret">{open ? "–" : "+"}</span>
      </button>

      <div className="ds-keepsakes-panel">
        {chips.length > 0 && (
          <ul className="ds-keepsakes-chips" aria-label="Captured so far">
            {chips.map((c) => (
              <li key={c.id} data-fresh={fresh === `chip:${c.id}` ? "true" : "false"}>
                <span aria-hidden="true">✓</span> {c.chip}
              </li>
            ))}
          </ul>
        )}
        {keeperLines.length > 0 && (
          <>
            <p className="ds-keepsakes-label">Your lines, kept word for word</p>
            <ul className="ds-keepsakes-lines">
              {keeperLines.map((line) => (
                <li key={line} data-fresh={fresh === line ? "true" : "false"}>&ldquo;{line}&rdquo;</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Screen readers hear a new line once, politely, without losing their place. */}
      <span className="ds-keepsakes-sr" role="status" aria-live="polite">
        {fresh && !fresh.startsWith("chip:") && newest ? `Kept: ${fresh}` : ""}
      </span>

      <style>{`
        /* Doubled class on purpose: the studio stage gives every direct child
           position: relative (globals.css), which outranked a single class and
           dropped this rail into the page flow on top of the header. */
        aside.ds-keepsakes.ds-keepsakes {
          position: fixed; left: 20px; top: 150px; z-index: 6; width: 252px;
          max-height: calc(100vh - 190px); overflow-y: auto; scrollbar-width: none;
          font-family: var(--font-manrope), sans-serif; color: rgba(249,247,242,0.82);
          pointer-events: none;
        }
        .ds-keepsakes::-webkit-scrollbar { display: none; }
        .ds-keepsakes > * { pointer-events: auto; }
        .ds-keepsakes-pill { display: none; }
        /* A descending stack of separate cards down the left margin, newest on top. */
        .ds-keepsakes-panel { display: flex; flex-direction: column; gap: 10px; }
        .ds-keepsakes-chips, .ds-keepsakes-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
        .ds-keepsakes-chips li, .ds-keepsakes-lines li {
          background: rgba(26,22,16,0.72); border: 1px solid rgba(249,247,242,0.10);
          border-radius: 12px; padding: 11px 13px; backdrop-filter: blur(10px);
          transition: border-color 900ms ease, background 600ms ease, color 600ms ease;
        }
        .ds-keepsakes-chips li { font-size: 12px; line-height: 1.35; color: #F0A878; border-color: rgba(240,168,120,0.28); }
        .ds-keepsakes-chips li[data-fresh="true"] { background: rgba(240,168,120,0.16); color: #FFD9BD; }
        .ds-keepsakes-label {
          margin: 4px 2px 0; font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase;
          color: rgba(249,247,242,0.45);
        }
        .ds-keepsakes-lines li {
          font-family: var(--font-lora), serif; font-style: italic; font-size: 13.5px; line-height: 1.5;
          color: rgba(249,247,242,0.86); border-left: 2px solid rgba(240,168,120,0.35);
        }
        .ds-keepsakes-lines li[data-fresh="true"] { border-color: #F0A878; color: #FFFFFF; }
        .ds-keepsakes-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

        /* Narrow screens: a pill that opens upward from the corner, so the
           question and the composer are never covered. */
        @media (max-width: 1100px) {
          aside.ds-keepsakes.ds-keepsakes { left: auto; right: 12px; top: auto; max-height: none; overflow: visible; bottom: calc(env(safe-area-inset-bottom, 0px) + 132px); width: auto; max-width: min(86vw, 340px); display: flex; flex-direction: column-reverse; align-items: flex-end; gap: 8px; }
          .ds-keepsakes-pill {
            display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
            background: rgba(26,22,16,0.82); color: rgba(249,247,242,0.82);
            border: 1px solid rgba(249,247,242,0.16); border-radius: 999px; padding: 8px 12px;
            font-size: 12px; font-family: inherit; backdrop-filter: blur(10px);
          }
          .ds-keepsakes-panel { display: none; width: min(86vw, 340px); max-height: 46vh; overflow-y: auto; }
          .ds-keepsakes.is-open .ds-keepsakes-panel { display: flex; }
          .ds-keepsakes-dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(240,168,120,0.55); transition: background 600ms ease, box-shadow 600ms ease; }
          .ds-keepsakes-dot[data-fresh="true"] { background: #F0A878; box-shadow: 0 0 0 5px rgba(240,168,120,0.18); }
          .ds-keepsakes-caret { opacity: 0.6; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ds-keepsakes-chips li, .ds-keepsakes-lines li, .ds-keepsakes-dot { transition: none; }
        }
      `}</style>
    </aside>
  );
}
