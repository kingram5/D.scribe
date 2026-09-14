"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

// ── Bookshelf ──────────────────────────────────────────────────────────────
// The dashboard as a physical library: a warm linen wall, wood planks, and the
// author's books standing on them, each with a parchment index card underneath
// showing where the manuscript is in the seven-step pipeline. Pure presentation:
// the page owns fetching, filtering and erase state and passes everything in.

export type ShelfStatus = "draft" | "in_progress" | "complete" | "erased";
export type ShelfFilter = "all" | ShelfStatus;

export interface ShelfBook {
  id: string;
  title: string;
  audience: string;
  status: ShelfStatus;
  updated_at: string;
  href: string;
}

export interface ShelfCounts {
  all: number;
  draft: number;
  in_progress: number;
  complete: number;
  erased: number;
}

interface BookshelfProps {
  ownerName: string;
  books: ShelfBook[];
  counts: ShelfCounts;
  filter: ShelfFilter;
  onFilter: (f: ShelfFilter) => void;
  eraseMode: boolean;
  onToggleErase: () => void;
  onEraseClick: (book: ShelfBook) => void;
  erasingId: string | null;
  loading: boolean;
  quote: { text: string; author: string };
  /** Rendered on the wall to the right of the sign (the usage widget). */
  aside?: ReactNode;
  /** Brand mark rendered inside the hanging sign. */
  brand?: ReactNode;
  /** Test/preview hook: pipeline step reached per book id (0-6). Falls back to localStorage. */
  progressOverride?: Record<string, number>;
}

export const PIPELINE_STEPS = ["Upload", "Transcript", "Structure", "Analysis", "Generate", "Editor", "Export"];

const COVERS = [
  "linear-gradient(160deg, #B8763A 0%, #8B5A2B 40%, #6B4423 100%)",
  "linear-gradient(160deg, #3D6B5A 0%, #2C5243 40%, #1E3B2F 100%)",
  "linear-gradient(160deg, #6B5A42 0%, #4A3D2C 40%, #352B1F 100%)",
  "linear-gradient(160deg, #8B3D50 0%, #6B2D3E 40%, #4A1F2C 100%)",
  "linear-gradient(160deg, #4A5A6B 0%, #2C3A4A 40%, #1E2A35 100%)",
  "linear-gradient(160deg, #6B6345 0%, #4A4531 40%, #352B1F 100%)",
];

const NOISE =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const STAMP: Record<ShelfStatus, { label: string; color: string }> = {
  draft: { label: "Draft", color: "#8C7B66" },
  in_progress: { label: "In progress", color: "#C17A47" },
  complete: { label: "Complete", color: "#4A7C59" },
  erased: { label: "Erased", color: "#B3352C" },
};

/** Where a book sits in the pipeline: the furthest step reached (remembered by
 *  PageShell in localStorage), else a sane guess from status. */
function stepFor(book: ShelfBook, override?: Record<string, number>, reached?: Record<string, number>): number {
  if (override && book.id in override) return override[book.id];
  if (reached && book.id in reached) return reached[book.id];
  if (book.status === "complete") return 6;
  if (book.status === "in_progress") return 3;
  return 0;
}

function useReachedSteps(ids: string[]): Record<string, number> {
  const [reached, setReached] = useState<Record<string, number>>({});
  const key = ids.join("|");
  useEffect(() => {
    const out: Record<string, number> = {};
    for (const id of key.split("|").filter(Boolean)) {
      try {
        const raw = localStorage.getItem(`ds_reached_${id}`);
        if (raw !== null) {
          const n = parseInt(raw, 10);
          if (!Number.isNaN(n)) out[id] = Math.max(0, Math.min(6, n));
        }
      } catch { /* storage unavailable */ }
    }
    setReached(out);
  }, [key]);
  return reached;
}

/** Books per plank, from the measured width of the shelf column. Measured before
 *  first paint so a phone never flashes a desktop-width row that pushes the
 *  page sideways. */
function usePerShelf(ref: React.RefObject<HTMLDivElement | null>): number {
  const [per, setPer] = useState(4);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const cs = getComputedStyle(el);
      const bookW = parseFloat(cs.getPropertyValue("--bs-book-w")) || 200;
      const gap = parseFloat(cs.getPropertyValue("--bs-gap")) || 40;
      const w = el.clientWidth - 48;
      setPer(Math.max(1, Math.min(6, Math.floor((w + gap) / (bookW + gap)))));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return per;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export default function Bookshelf(props: BookshelfProps) {
  const {
    ownerName, books, counts, filter, onFilter, eraseMode, onToggleErase, onEraseClick,
    erasingId, loading, quote, aside, brand, progressOverride,
  } = props;
  const shelvesRef = useRef<HTMLDivElement>(null);
  const perShelf = usePerShelf(shelvesRef);
  const reached = useReachedSteps(books.map((b) => b.id));
  const rows = chunk(books, perShelf);
  const isEmptyLibrary = !loading && counts.all === 0 && filter === "all";
  const isEmptyFilter = !loading && books.length === 0 && !isEmptyLibrary;

  const pills: { key: ShelfFilter; label: string; n: number }[] = [
    { key: "all", label: "All", n: counts.all },
    { key: "draft", label: "Draft", n: counts.draft },
    { key: "in_progress", label: "In progress", n: counts.in_progress },
    { key: "complete", label: "Complete", n: counts.complete },
    { key: "erased", label: "Erased", n: counts.erased },
  ];

  return (
    <div className="bs-root">
      <style>{BOOKSHELF_CSS}</style>

      {/* The wall: warm linen, lit from above, vignetted at the edges. */}
      <div className="bs-wall" aria-hidden="true">
        <div className="bs-wall-weave" />
        <div className="bs-wall-noise" />
        <div className="bs-wall-light" />
      </div>

      <div className="bs-scroll">
        {/* Header: hanging sign + title on the left, usage on the right */}
        <header className="bs-header">
          <div className="bs-header-left">
            <div className="bs-sign">
              <span className="bs-chain bs-chain-l" />
              <span className="bs-chain bs-chain-r" />
              <div className="bs-sign-board">
                {brand ?? <span className="bs-sign-fallback">D. scribe</span>}
              </div>
            </div>
            <div className="bs-title-block">
              <h1 className="bs-title">{ownerName ? `${ownerName}’s Library` : "Your Library"}</h1>
              <p className="bs-quote">
                &ldquo;{quote.text}&rdquo; <span className="bs-quote-author">&mdash; {quote.author}</span>
              </p>
            </div>
          </div>
          {aside && <div className="bs-header-aside">{aside}</div>}
        </header>

        {/* Toolbar: parchment filter pills + actions */}
        <div className="bs-toolbar" role="tablist" aria-label="Filter books">
          <div className="bs-pills">
            {pills.map((p) => (
              <button
                key={p.key}
                role="tab"
                aria-selected={filter === p.key}
                className={`bs-pill${filter === p.key ? " is-active" : ""}`}
                onClick={() => onFilter(p.key)}
              >
                {p.label} <span className="bs-pill-n">{p.n}</span>
              </button>
            ))}
          </div>
          <div className="bs-actions">
            <Link href="/project/new" className="bs-pill bs-pill-primary">+ New book</Link>
            <button
              className={`bs-pill bs-pill-ghost${eraseMode ? " is-danger" : ""}`}
              onClick={onToggleErase}
              aria-pressed={eraseMode}
            >
              {eraseMode ? "✕ Cancel" : "⌫ Erase"}
            </button>
          </div>
        </div>
        {eraseMode && <p className="bs-erase-hint">Pick a book to move it to the Erased shelf.</p>}

        {/* Shelves */}
        <div className="bs-shelves" ref={shelvesRef}>
          {loading && (
            <Shelf perShelf={perShelf}>
              <div className="bs-loading ds-label">Dusting the shelves&hellip;</div>
            </Shelf>
          )}

          {isEmptyLibrary && (
            <Shelf perShelf={Math.max(2, Math.min(perShelf, 3))} cards={
              <div className="bs-card bs-card-wide">
                <div className="ds-label">Seven steps, one book</div>
                <ol className="bs-steps">
                  {PIPELINE_STEPS.map((s, i) => (
                    <li key={s}><span className="bs-step-n">{i + 1}</span>{s}</li>
                  ))}
                </ol>
                <p className="bs-steps-note">Upload a talk, a sermon, a lecture. Just keep talking. The shelf fills itself.</p>
              </div>
            }>
              <Link href="/project/new" className="bs-ghost-book">
                <span className="bs-ghost-plus">+</span>
                <span className="bs-ghost-title">Your first book</span>
                <span className="bs-ghost-sub">starts with a recording</span>
              </Link>
            </Shelf>
          )}

          {isEmptyFilter && (
            <Shelf perShelf={perShelf}>
              <p className="bs-empty-note">No {filter.replace("_", " ")} books on this shelf.</p>
            </Shelf>
          )}

          {!loading && rows.map((row, r) => (
            <Shelf
              key={r}
              perShelf={perShelf}
              cards={row.map((book) => (
                <BookCard key={book.id} book={book} step={stepFor(book, progressOverride, reached)} />
              ))}
            >
              {row.map((book, i) => (
                <Book
                  key={book.id}
                  book={book}
                  cover={COVERS[(r * perShelf + i) % COVERS.length]}
                  eraseMode={eraseMode}
                  erasing={erasingId === book.id}
                  onEraseClick={onEraseClick}
                />
              ))}
            </Shelf>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function Shelf({ perShelf, children, cards }: { perShelf: number; children: ReactNode; cards?: ReactNode }) {
  const cols = { gridTemplateColumns: `repeat(${perShelf}, var(--bs-book-w))` };
  return (
    <section className="bs-shelf">
      <div className="bs-row bs-row-books" style={cols}>{children}</div>
      <div className="bs-plank" aria-hidden="true">
        <span className="bs-bracket bs-bracket-l" />
        <span className="bs-bracket bs-bracket-r" />
      </div>
      {cards && <div className="bs-row bs-row-cards" style={cols}>{cards}</div>}
    </section>
  );
}

function Book({ book, cover, eraseMode, erasing, onEraseClick }: {
  book: ShelfBook; cover: string; eraseMode: boolean; erasing: boolean; onEraseClick: (b: ShelfBook) => void;
}) {
  if (eraseMode) {
    return (
      <div
        className="bs-book-slot"
        onClick={() => !erasing && onEraseClick(book)}
        style={{ cursor: erasing ? "wait" : "pointer" }}
        role="button"
        aria-label={`Erase ${book.title}`}
      >
        <div className="bs-book bs-book-erase">
          <div className="bs-cover" style={{ background: cover, opacity: 0.4 }} />
          <div className="bs-erase-overlay">
            <span className="bs-erase-glyph">{"⌫"}</span>
            <span className="bs-erase-title">{book.title}</span>
          </div>
        </div>
        <div className="bs-book-shadow" />
      </div>
    );
  }
  return (
    <Link href={book.href} className="bs-book-slot" aria-label={`Open ${book.title}`}>
      <div className="bs-book book-hover">
        <div className="bs-back" />
        <div className="bs-pages">
          {Array.from({ length: 20 }).map((_, i) => (
            <span key={i} className="bs-page-line" style={{ top: 8 + i * 12 }} />
          ))}
        </div>
        <div className="bs-spine">
          <span className="bs-spine-rule" style={{ top: 20 }} />
          <span className="bs-spine-rule" style={{ bottom: 20 }} />
        </div>
        <div className="bs-cover" style={{ background: cover }}>
          <div className="bs-cover-grain" />
          <div className="bs-cover-rule bs-cover-rule-top" />
          <div className="bs-cover-body">
            <div className="bs-cover-dash" />
            <h3 className="bs-cover-title">{book.title}</h3>
            <p className="bs-cover-audience">{book.audience}</p>
          </div>
          <div className="bs-cover-rule bs-cover-rule-bottom" />
          {book.status === "draft" && <div className="bs-cover-dim" />}
          {book.status === "in_progress" && <div className="bs-cover-strip" />}
        </div>
      </div>
      <div className="bs-book-shadow" />
    </Link>
  );
}

function BookCard({ book, step }: { book: ShelfBook; step: number }) {
  const stamp = STAMP[book.status];
  const pct = book.status === "complete" ? 100 : Math.round(((step + 0.5) / PIPELINE_STEPS.length) * 100);
  // Fixed locale + zone so the server and the browser print the same string
  // (a runtime-locale date here is a hydration mismatch waiting to happen).
  const date = new Date(book.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <div className="bs-card">
      <div className="bs-card-head">
        <span className="bs-card-title" title={book.title}>{book.title}</span>
        <span className="bs-card-date">{date}</span>
      </div>
      <div className="bs-card-audience ds-label">{book.audience}</div>
      <div className="bs-progress" aria-label={`Step ${Math.min(step + 1, 7)} of 7: ${PIPELINE_STEPS[Math.min(step, 6)]}`}>
        <div className="bs-progress-track"><i style={{ transform: `scaleX(${pct / 100})` }} /></div>
        <div className="bs-pips">
          {PIPELINE_STEPS.map((s, i) => (
            <i key={s} className={i <= step || book.status === "complete" ? "on" : ""} title={s} />
          ))}
        </div>
      </div>
      <div className="bs-card-foot">
        <span className="ds-stamp" style={{ color: stamp.color }}>{stamp.label}</span>
        <span className="bs-card-step">
          {book.status === "complete" ? "Exported" : `${PIPELINE_STEPS[Math.min(step, 6)]} · ${Math.min(step + 1, 7)}/7`}
        </span>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
// Warm palette only. Wood and linen are drawn with gradients; no image assets.

const BOOKSHELF_CSS = `
.bs-root {
  --bs-book-w: 200px;
  --bs-book-h: 280px;
  --bs-gap: 40px;
  --bs-plank-h: 22px;
  --bs-ink: #F9F7F2;
  --bs-ink-soft: #C8C0B4;
  --bs-copper: #C17A47;
  --bs-parchment: #F4ECDC;
  --bs-parchment-edge: #D9C7A3;
  position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column;
  color: var(--bs-ink);
}
.bs-wall { position: fixed; inset: 0; z-index: 0; background: #2C2419; overflow: hidden; }
.bs-wall-weave {
  position: absolute; inset: 0; opacity: 0.9;
  background-image:
    repeating-linear-gradient(0deg, rgba(255,235,205,0.035) 0 1px, transparent 1px 3px),
    repeating-linear-gradient(90deg, rgba(255,235,205,0.03) 0 1px, transparent 1px 3px),
    linear-gradient(180deg, #3A2F21 0%, #2C2419 45%, #221B12 100%);
}
.bs-wall-noise { position: absolute; inset: 0; background-image: ${NOISE}; opacity: 0.07; mix-blend-mode: overlay; }
.bs-wall-light {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 70% 45% at 50% -5%, rgba(255,205,150,0.16), transparent 70%),
    radial-gradient(ellipse 120% 80% at 50% 60%, transparent 50%, rgba(0,0,0,0.45) 100%);
}
.bs-scroll { position: relative; z-index: 1; flex: 1; min-height: 0; overflow: hidden auto; padding: 24px 40px 72px; max-width: 100%; }
.bs-shelf, .bs-row { max-width: 100%; }

/* Header */
.bs-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 32px; flex-wrap: wrap; margin-bottom: 26px; }
.bs-header-left { display: flex; align-items: flex-end; gap: 28px; flex-wrap: wrap; }
.bs-sign { position: relative; padding-top: 34px; }
.bs-chain {
  position: absolute; top: 0; width: 3px; height: 36px;
  background: repeating-linear-gradient(180deg, #8f7a5c 0 5px, #4d3b28 5px 8px);
  border-radius: 2px; box-shadow: 0 1px 0 rgba(0,0,0,0.5);
}
.bs-chain-l { left: 22px; transform: rotate(6deg); }
.bs-chain-r { right: 22px; transform: rotate(-6deg); }
.bs-sign-board {
  position: relative; padding: 10px 18px; border-radius: 8px;
  background:
    repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0 2px, transparent 2px 11px),
    linear-gradient(180deg, #A9743F 0%, #8E5D31 50%, #74471F 100%);
  box-shadow: 0 0 0 1px #4a2d13, 0 12px 26px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,220,170,0.4), inset 0 -3px 0 rgba(0,0,0,0.25);
  transform: rotate(-1.2deg);
}
.bs-sign-board::before, .bs-sign-board::after {
  content: ""; position: absolute; top: 8px; width: 7px; height: 7px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #f0d6a8, #8a6a3a 70%); box-shadow: 0 1px 1px rgba(0,0,0,0.6);
}
.bs-sign-board::before { left: 8px; } .bs-sign-board::after { right: 8px; }
.bs-sign-fallback { font-family: var(--font-playfair), serif; font-style: italic; font-size: 34px; color: #F4E8D1; }
.bs-title-block { padding-bottom: 6px; max-width: 560px; }
.bs-title { font-family: var(--font-lora), serif; font-weight: 400; font-size: 44px; letter-spacing: -0.02em; line-height: 1.05; margin: 0 0 8px; color: var(--bs-ink); text-shadow: 0 2px 12px rgba(0,0,0,0.45); }
.bs-quote { font-family: var(--font-lora), serif; font-style: italic; font-size: 14px; line-height: 1.5; color: var(--bs-ink-soft); margin: 0; }
.bs-quote-author { font-style: normal; font-family: var(--font-geist-mono), monospace; font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: #A89F94; margin-left: 4px; }
.bs-header-aside { min-width: 300px; max-width: 380px; flex: 0 1 380px; }

/* Toolbar */
.bs-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
.bs-pills, .bs-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.bs-pill {
  font-family: var(--font-manrope), sans-serif; font-weight: 700; font-size: 13px; line-height: 1;
  padding: 10px 14px; border-radius: 999px; cursor: pointer; text-decoration: none;
  color: #2C2419; background: var(--bs-parchment);
  border: 1px solid rgba(44,36,25,0.55);
  box-shadow: 0 2px 0 #b89a6a, 0 6px 14px rgba(0,0,0,0.35);
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
}
.bs-pill:hover { transform: translateY(-1px); }
.bs-pill:active { transform: translateY(1px); box-shadow: 0 0 0 #b89a6a, 0 3px 8px rgba(0,0,0,0.35); }
.bs-pill.is-active { background: var(--bs-copper); color: #fff; border-color: #7a4a26; box-shadow: 0 2px 0 #7a4a26, 0 6px 14px rgba(0,0,0,0.35); }
.bs-pill-n { display: inline-block; margin-left: 6px; font-family: var(--font-geist-mono), monospace; font-size: 11px; opacity: 0.75; }
.bs-pill-primary { background: var(--bs-copper); color: #fff; border-color: #7a4a26; box-shadow: 0 2px 0 #7a4a26, 0 6px 14px rgba(0,0,0,0.35); }
.bs-pill-ghost { background: transparent; color: var(--bs-ink-soft); border-color: rgba(249,247,242,0.3); box-shadow: none; }
.bs-pill-ghost.is-danger { color: #ffb4ad; border-color: #dc2626; background: rgba(220,38,38,0.12); }
.bs-erase-hint { font-family: var(--font-kalam), cursive; color: #ffb4ad; font-size: 15px; margin: 6px 0 0; }

/* Shelves */
.bs-shelves { display: flex; flex-direction: column; gap: 44px; margin-top: 30px; }
.bs-shelf { position: relative; padding: 0 24px; }
.bs-row { display: grid; justify-content: center; column-gap: var(--bs-gap); }
.bs-row-books { align-items: end; min-height: calc(var(--bs-book-h) + 18px); position: relative; z-index: 2; }
.bs-row-cards { margin-top: calc(var(--bs-plank-h) + 14px + 14px); align-items: start; }
.bs-plank {
  position: absolute; left: 0; right: 0; top: calc(var(--bs-book-h) + 18px); height: var(--bs-plank-h); z-index: 1;
  border-radius: 3px 3px 0 0;
  background-image:
    repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 7px, rgba(255,255,255,0.03) 7px 8px, transparent 8px 19px),
    linear-gradient(180deg, #B27B45 0%, #9E6A38 35%, #8A5A2E 100%);
  box-shadow: inset 0 1px 0 rgba(255,225,180,0.45), 0 -6px 14px rgba(0,0,0,0.25);
}
.bs-plank::after {
  content: ""; position: absolute; left: 0; right: 0; top: 100%; height: 13px; border-radius: 0 0 4px 4px;
  background: linear-gradient(180deg, #6A4120 0%, #4E2E14 100%);
  box-shadow: 0 10px 22px rgba(0,0,0,0.6), 0 2px 0 rgba(0,0,0,0.4);
}
.bs-bracket {
  position: absolute; top: calc(var(--bs-plank-h) + 13px); width: 0; height: 0;
  border-top: 18px solid #4E2E14; border-left: 14px solid transparent; border-right: 14px solid transparent;
  filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));
}
.bs-bracket-l { left: 6%; } .bs-bracket-r { right: 6%; }
.bs-loading, .bs-empty-note { grid-column: 1 / -1; justify-self: center; align-self: end; padding-bottom: 28px; color: var(--bs-ink-soft); font-family: var(--font-lora), serif; font-style: italic; font-size: 15px; }
.bs-loading { font-style: normal; }

/* Books (same 3D book as before, now standing on wood) */
.bs-book-slot { position: relative; display: block; width: var(--bs-book-w); height: var(--bs-book-h); perspective: 1000px; text-decoration: none; }
.bs-book { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; }
.book-hover { transition: transform 0.6s cubic-bezier(0.16,1,0.3,1); }
.bs-book-slot:hover .book-hover { transform: rotateY(-18deg) rotateX(3deg) translateY(-10px); }
.bs-book-shadow {
  position: absolute; left: 12px; right: 12px; bottom: -6px; height: 16px; border-radius: 50%;
  background: radial-gradient(ellipse, rgba(0,0,0,0.55) 0%, transparent 70%); z-index: 0;
  transition: transform 0.6s cubic-bezier(0.16,1,0.3,1), opacity 0.6s ease;
}
.bs-book-slot:hover .bs-book-shadow { transform: translateY(8px) scaleX(1.08); opacity: 0.8; }
.bs-back { position: absolute; inset: 0; background: #2C1F15; border-radius: 2px 8px 8px 2px; transform: translateZ(-24px); }
.bs-pages { position: absolute; top: 4px; bottom: 4px; right: 0; width: 22px; background: linear-gradient(to right, #E8E0D0, #F4F1E8 30%, #EDE8DC 70%, #E0D8C8); transform: translateZ(-12px) translateX(4px); border-radius: 0 4px 4px 0; box-shadow: inset -1px 0 2px rgba(0,0,0,0.05); }
.bs-page-line { position: absolute; right: 2px; width: 16px; height: 0.5px; background: rgba(0,0,0,0.05); }
.bs-spine { position: absolute; left: -12px; top: 0; bottom: 0; width: 24px; background: linear-gradient(90deg, rgba(0,0,0,0.4), rgba(0,0,0,0.15) 30%, rgba(255,255,255,0.05) 70%, rgba(0,0,0,0.1)); transform: rotateY(90deg); transform-origin: right center; border-radius: 4px 0 0 4px; }
.bs-spine-rule { position: absolute; left: 4px; right: 4px; height: 1px; background: rgba(193,122,71,0.35); }
.bs-cover { position: absolute; inset: 0; border-radius: 2px 12px 12px 2px; padding: 28px 20px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06); overflow: hidden; }
.bs-cover-grain { position: absolute; inset: 0; background-image: ${NOISE}; opacity: 0.05; mix-blend-mode: multiply; pointer-events: none; }
.bs-cover-rule { position: absolute; left: 12px; right: 12px; height: 1px; background: linear-gradient(to right, transparent, rgba(193,122,71,0.35), transparent); }
.bs-cover-rule-top { top: 12px; } .bs-cover-rule-bottom { bottom: 12px; }
.bs-cover-body { position: relative; z-index: 1; }
.bs-cover-dash { width: 24px; height: 1px; background: rgba(193,122,71,0.55); margin-bottom: 16px; }
.bs-cover-title { font-family: var(--font-playfair), var(--font-lora), serif; font-style: italic; font-size: 22px; font-weight: 500; color: #F4E8D1; line-height: 1.2; margin: 0 0 8px; text-shadow: 0 1px 3px rgba(0,0,0,0.35); display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.bs-cover-audience { font-family: var(--font-manrope), sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.4); margin: 0; }
.bs-cover-dim { position: absolute; inset: 0; background: rgba(0,0,0,0.22); border-radius: inherit; pointer-events: none; }
.bs-cover-strip { position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: var(--bs-copper); border-radius: 0 0 10px 2px; pointer-events: none; }
.bs-book-erase .bs-cover { border-radius: 2px 12px 12px 2px; }
.bs-erase-overlay { position: absolute; inset: 0; background: rgba(220,38,38,0.65); border-radius: 2px 12px 12px 2px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #fff; }
.bs-erase-glyph { font-size: 28px; } .bs-erase-title { font-size: 11px; font-weight: 700; text-align: center; padding: 0 12px; }

/* Ghost book for an empty library */
.bs-ghost-book {
  width: var(--bs-book-w); height: var(--bs-book-h); border-radius: 2px 12px 12px 2px;
  border: 1.5px dashed rgba(249,247,242,0.4); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  color: var(--bs-ink); text-decoration: none; background: rgba(249,247,242,0.04); position: relative; z-index: 2;
  grid-column: 1 / -1; justify-self: center;
  transition: background 200ms ease, transform 300ms ease;
}
.bs-ghost-book:hover { background: rgba(193,122,71,0.14); transform: translateY(-6px); }
.bs-ghost-plus { font-size: 36px; line-height: 1; color: var(--bs-copper); }
.bs-ghost-title { font-family: var(--font-playfair), serif; font-style: italic; font-size: 20px; }
.bs-ghost-sub { font-family: var(--font-manrope), sans-serif; font-size: 11px; color: var(--bs-ink-soft); letter-spacing: 0.04em; }

/* Parchment index cards */
.bs-card {
  background: var(--bs-parchment); color: #2C2419; border-radius: 6px; padding: 10px 12px 9px;
  border: 1px solid rgba(44,36,25,0.5); box-shadow: 3px 3px 0 rgba(0,0,0,0.35), 0 10px 18px rgba(0,0,0,0.3);
  position: relative; overflow: hidden;
}
.bs-card::before { content: ""; position: absolute; inset: 0; border-radius: 6px; background: linear-gradient(180deg, rgba(255,255,255,0.4), transparent 45%); pointer-events: none; }
.bs-card::after { content: ""; position: absolute; inset: 0; background-image: ${NOISE}; opacity: 0.045; mix-blend-mode: multiply; pointer-events: none; }
.bs-card > * { position: relative; z-index: 1; }
.bs-card-wide { grid-column: 1 / -1; justify-self: center; width: min(100%, 520px); }
.bs-card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.bs-card-title { font-family: var(--font-lora), serif; font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bs-card-date { font-family: var(--font-geist-mono), monospace; font-size: 10px; color: #7A6A4A; white-space: nowrap; }
.bs-card-audience { margin-top: 2px; color: #7A6A4A !important; }
.bs-progress { margin: 8px 0 7px; }
.bs-progress-track { height: 7px; border-radius: 4px; background: #E3D5B8; box-shadow: inset 0 1px 2px rgba(0,0,0,0.18); overflow: hidden; }
.bs-progress-track i { display: block; width: 100%; height: 100%; border-radius: 4px; background: linear-gradient(90deg, #E29B6D, #C17A47); box-shadow: inset 0 -1px 0 rgba(0,0,0,0.18); transform-origin: left center; transition: transform 600ms cubic-bezier(0.2,1,0.3,1); }
.bs-pips { display: flex; gap: 4px; margin-top: 5px; }
.bs-pips i { width: 9px; height: 9px; border-radius: 50%; background: #CDBF9F; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08); }
.bs-pips i.on { background: linear-gradient(135deg, #E29B6D, #C17A47); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.5), 0 1px 2px rgba(0,0,0,0.3); }
.bs-card-foot { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.bs-card-step { font-family: var(--font-manrope), sans-serif; font-size: 11px; color: #5A4A36; }
.bs-steps { list-style: none; margin: 8px 0 6px; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; font-family: var(--font-manrope), sans-serif; font-size: 12.5px; }
.bs-steps li { display: flex; align-items: center; gap: 8px; }
.bs-step-n { width: 18px; height: 18px; border-radius: 50%; background: var(--bs-copper); color: #fff; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.bs-steps-note { font-family: var(--font-lora), serif; font-style: italic; font-size: 12.5px; color: #5A4A36; margin: 4px 0 0; }

@media (max-width: 768px) {
  .bs-root { --bs-book-w: 150px; --bs-book-h: 210px; --bs-gap: 20px; --bs-plank-h: 16px; }
  .bs-scroll { padding: 12px 16px 96px; overflow: visible; overflow-x: clip; }
  .bs-title { font-size: 30px; }
  .bs-header { gap: 16px; }
  .bs-header-left { gap: 16px; }
  .bs-sign-board { padding: 8px 12px; }
  .bs-header-aside { min-width: 0; flex-basis: 100%; }
  .bs-shelves { gap: 34px; }
  .bs-shelf { padding: 0 8px; }
  .bs-cover { padding: 18px 14px; }
  .bs-cover-title { font-size: 17px; }
  .bs-card-wide { grid-column: 1 / -1; }
  .bs-steps { grid-template-columns: 1fr; }
  .bs-bracket-l { left: 4%; } .bs-bracket-r { right: 4%; }
}
`;
