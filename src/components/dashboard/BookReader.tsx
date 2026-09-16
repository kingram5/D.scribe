"use client";

import { useEffect } from "react";
import Link from "next/link";
import { PIPELINE_STEPS, type ShelfBook } from "./Bookshelf";

// The "pick it up and open it" moment. A book lifts off the shelf into the middle
// of the room, the cover swings open on its hinge, and the spread inside shows the
// title page on the left and where the manuscript stands on the right. Continue
// goes into the project; Close (or Esc, or the wall) puts it back.

export type ReaderStage = "zoom" | "open" | "closing";

export interface BookReaderProps {
  book: ShelfBook;
  cover: string;
  ownerName: string;
  step: number; // 0-6 reached
  stage: ReaderStage;
  onClose: () => void;
}

export default function BookReader({ book, cover, ownerName, step, stage, onClose }: BookReaderProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const done = book.status === "complete";
  const reached = done ? PIPELINE_STEPS.length : step + 1; // steps considered finished
  const nextIdx = Math.min(reached, PIPELINE_STEPS.length - 1);
  const pct = done ? 100 : Math.round((reached / PIPELINE_STEPS.length) * 100);
  const touched = new Date(book.updated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <div className={`bs-reader bs-reader-${stage}`} role="dialog" aria-modal="true" aria-label={`${book.title}, opened`} onClick={onClose}>
      <style>{READER_CSS}</style>
      <div className="bs-reader-stage" onClick={(e) => e.stopPropagation()}>
        <div className="bs-reader-book">
          {/* The block of pages: the right-hand page of the spread */}
          <div className="bs-reader-page bs-reader-page-right">
            <div className="bs-reader-page-inner">
              <div className="ds-label">Where you are</div>
              <div className="bs-reader-pct">
                <span className="bs-reader-pct-n">{pct}%</span>
                <span className="bs-reader-pct-l">{done ? "finished and exported" : `through step ${Math.min(reached, 7)} of 7`}</span>
              </div>
              <ol className="bs-reader-steps">
                {PIPELINE_STEPS.map((s, i) => {
                  const state = i < reached ? "done" : i === nextIdx && !done ? "next" : "todo";
                  return (
                    <li key={s} className={`bs-reader-step is-${state}`}>
                      <span className="bs-reader-mark">{state === "done" ? "✓" : state === "next" ? "▸" : ""}</span>
                      <span>{s}</span>
                    </li>
                  );
                })}
              </ol>
              <div className="bs-reader-actions">
                <Link href={book.href} className="bs-pill bs-pill-primary bs-reader-go">
                  {done ? "Open the manuscript" : `Continue · ${PIPELINE_STEPS[nextIdx]}`}
                </Link>
                <button className="bs-pill bs-pill-ghost bs-reader-close" onClick={onClose}>Put it back</button>
              </div>
            </div>
            <div className="bs-reader-gutter" />
          </div>

          {/* The cover, hinged on the left. Its back is the title page. */}
          <div className="bs-reader-cover">
            <div className="bs-reader-cover-front" style={{ background: cover }}>
              <div className="bs-cover-grain" />
              <div className="bs-cover-rule bs-cover-rule-top" />
              <div className="bs-cover-body">
                <div className="bs-cover-dash" />
                <h3 className="bs-cover-title bs-reader-cover-title">{book.title}</h3>
                <p className="bs-cover-audience">{book.audience}</p>
              </div>
              <div className="bs-cover-rule bs-cover-rule-bottom" />
            </div>
            <div className="bs-reader-cover-back">
              <div className="bs-reader-page-inner bs-reader-title-page">
                <div className="bs-reader-ornament">{"❦"}</div>
                <h2 className="bs-reader-title">{book.title}</h2>
                <div className="bs-reader-rule" />
                <p className="bs-reader-by">a manuscript by</p>
                <p className="bs-reader-author">{ownerName || "the author"}</p>
                <p className="bs-reader-meta">{book.audience}</p>
                <p className="bs-reader-meta bs-reader-meta-soft">last touched {touched}</p>
              </div>
            </div>
          </div>

          {/* Spine and page edges so the closed book has a body */}
          <div className="bs-reader-edges" />
          <div className="bs-reader-shadow" />
        </div>
      </div>
    </div>
  );
}

const READER_CSS = `
.bs-reader {
  position: fixed; inset: 0; z-index: 60; display: grid; place-items: center;
  --rb-w: 300px; --rb-h: 420px;
  background: radial-gradient(ellipse at 50% 40%, rgba(60,45,28,0.55), rgba(10,7,4,0.82) 70%);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  animation: bs-reader-in 320ms ease both;
}
.bs-reader-closing { animation: bs-reader-out 420ms ease both; }
@keyframes bs-reader-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes bs-reader-out { from { opacity: 1; } to { opacity: 0; } }
.bs-reader-stage { perspective: 1800px; perspective-origin: 50% 45%; }
.bs-reader-book {
  position: relative; width: var(--rb-w); height: var(--rb-h); transform-style: preserve-3d;
  transition: transform 640ms var(--bs-spring, cubic-bezier(0.2,1.35,0.3,1));
  animation: bs-reader-lift 640ms var(--bs-spring, cubic-bezier(0.2,1.35,0.3,1)) both;
}
@keyframes bs-reader-lift { from { opacity: 0; transform: translateY(80px) scale(0.55) rotateX(12deg); } to { opacity: 1; transform: none; } }
/* Once open, slide the block right so the two-page spread sits centered */
.bs-reader-open .bs-reader-book { transform: translateX(calc(var(--rb-w) / 2)); }
.bs-reader-closing .bs-reader-book { transform: translateX(0) scale(0.9); opacity: 0; transition: transform 420ms ease, opacity 380ms ease; }

.bs-reader-page {
  position: absolute; inset: 0; border-radius: 2px 10px 10px 2px;
  background: #F6EEDD; color: #2C2419;
  box-shadow: 0 30px 60px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(44,36,25,0.15);
}
.bs-reader-page-right::before {
  /* stacked page edges */
  content: ""; position: absolute; right: -6px; top: 4px; bottom: 4px; width: 8px; border-radius: 0 3px 3px 0;
  background: repeating-linear-gradient(180deg, #EFE6D1 0 2px, #D9CDB2 2px 3px);
}
.bs-reader-gutter { position: absolute; left: 0; top: 0; bottom: 0; width: 34px; background: linear-gradient(90deg, rgba(0,0,0,0.22), rgba(0,0,0,0.06) 60%, transparent); pointer-events: none; border-radius: 2px 0 0 2px; }
.bs-reader-page-inner { position: absolute; inset: 0; padding: 30px 26px 26px 40px; display: flex; flex-direction: column; }
.bs-reader-pct { display: flex; align-items: baseline; gap: 10px; margin: 8px 0 12px; }
.bs-reader-pct-n { font-family: var(--font-lora), serif; font-size: 40px; line-height: 1; color: #C17A47; }
.bs-reader-pct-l { font-family: var(--font-manrope), sans-serif; font-size: 12px; color: #6B5A42; }
.bs-reader-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-family: var(--font-manrope), sans-serif; font-size: 13.5px; }
.bs-reader-step { display: flex; align-items: center; gap: 10px; color: #8C7B66; }
.bs-reader-step.is-done { color: #2C2419; }
.bs-reader-step.is-next { color: #C17A47; font-weight: 700; }
.bs-reader-mark { width: 18px; height: 18px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; background: #E3D5B8; color: #2C2419; }
.is-done .bs-reader-mark { background: #4A7C59; color: #fff; }
.is-next .bs-reader-mark { background: #C17A47; color: #fff; }
.bs-reader-actions { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
.bs-reader-go, .bs-reader-close { text-align: center; }
.bs-reader-close { color: #6B5A42 !important; border-color: rgba(44,36,25,0.3) !important; }

.bs-reader-cover {
  position: absolute; inset: 0; transform-style: preserve-3d; transform-origin: left center;
  transition: transform 900ms cubic-bezier(0.4, 0.05, 0.2, 1); transition-delay: 120ms;
}
.bs-reader-open .bs-reader-cover { transform: rotateY(-162deg); }
.bs-reader-closing .bs-reader-cover { transform: rotateY(0deg); transition-delay: 0ms; transition-duration: 380ms; }
.bs-reader-cover-front, .bs-reader-cover-back {
  position: absolute; inset: 0; border-radius: 2px 10px 10px 2px; backface-visibility: hidden; -webkit-backface-visibility: hidden;
}
.bs-reader-cover-front { padding: 34px 26px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; box-shadow: 0 6px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08); }
.bs-reader-cover-title { font-size: 28px; }
.bs-reader-cover-back {
  transform: rotateY(180deg); background: #F6EEDD; color: #2C2419; border-radius: 10px 2px 2px 10px;
  box-shadow: inset 0 0 0 1px rgba(44,36,25,0.15);
}
.bs-reader-cover-back::after { content: ""; position: absolute; right: 0; top: 0; bottom: 0; width: 34px; background: linear-gradient(270deg, rgba(0,0,0,0.2), rgba(0,0,0,0.05) 60%, transparent); pointer-events: none; }
.bs-reader-title-page { align-items: center; justify-content: center; text-align: center; padding: 30px 40px 30px 26px; }
.bs-reader-ornament { color: #C17A47; font-size: 22px; margin-bottom: 8px; }
.bs-reader-title { font-family: var(--font-playfair), serif; font-style: italic; font-weight: 500; font-size: 26px; line-height: 1.15; margin: 0; }
.bs-reader-rule { width: 48px; height: 1px; background: #C17A47; margin: 14px 0; }
.bs-reader-by { font-family: var(--font-lora), serif; font-style: italic; font-size: 12px; color: #6B5A42; margin: 0; }
.bs-reader-author { font-family: var(--font-lora), serif; font-size: 16px; margin: 4px 0 14px; }
.bs-reader-meta { font-family: var(--font-geist-mono), monospace; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #6B5A42; margin: 0; }
.bs-reader-meta-soft { margin-top: 6px; text-transform: none; letter-spacing: 0.04em; color: #8C7B66; }

.bs-reader-edges { position: absolute; left: -12px; top: 0; bottom: 0; width: 24px; transform: rotateY(90deg); transform-origin: right center; background: linear-gradient(90deg, rgba(0,0,0,0.5), rgba(0,0,0,0.2) 40%, rgba(255,255,255,0.05) 70%, rgba(0,0,0,0.15)); border-radius: 4px 0 0 4px; }
.bs-reader-shadow { position: absolute; left: 10px; right: 10px; bottom: -34px; height: 40px; border-radius: 50%; background: radial-gradient(ellipse, rgba(0,0,0,0.6), transparent 70%); transform: translateZ(-40px); }

@media (max-width: 768px) {
  .bs-reader { --rb-w: min(78vw, 300px); --rb-h: min(108vw, 420px); }
  /* Phones have no room for a spread: the cover swings all the way round and tucks behind */
  .bs-reader-open .bs-reader-book { transform: translateX(0); }
  .bs-reader-open .bs-reader-cover { transform: rotateY(-180deg) translateZ(-2px); opacity: 0; transition: transform 900ms cubic-bezier(0.4,0.05,0.2,1) 120ms, opacity 200ms ease 760ms; }
  .bs-reader-open .bs-reader-cover-back { visibility: hidden; }
  .bs-reader-closing .bs-reader-cover { opacity: 1; transition: transform 380ms ease, opacity 120ms ease; }
  .bs-reader-page-inner { padding: 24px 20px 20px 30px; }
}
`;
