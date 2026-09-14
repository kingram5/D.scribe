"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Knickknack, type KnickknackKind } from "./Knickknacks";
import BookReader, { type ReaderStage } from "./BookReader";

const MANTLE: KnickknackKind[] = ["lamp", "manuscript", "mic", "inkwell", "coffee", "plant", "candle", "hourglass"];

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
  /** Test/preview hook: render this book in its hovered state. */
  hoverPreviewId?: string;
  /** Test/preview hook: start with this book opened. */
  openPreviewId?: string;
}

/** Shelves shown per page before the wooden arrows take over. */
const SHELVES_PER_PAGE = 2;

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
    erasingId, loading, quote, aside, brand, progressOverride, hoverPreviewId, openPreviewId,
  } = props;
  // Open book (the reader): which one, and where the animation is.
  const [openBook, setOpenBook] = useState<ShelfBook | null>(() => openPreviewId ? books.find((b) => b.id === openPreviewId) ?? null : null);
  const [stage, setStage] = useState<ReaderStage>(openPreviewId ? "open" : "zoom");
  const openIt = (book: ShelfBook) => {
    setOpenBook(book);
    setStage("zoom");
    // Let the lift land, then swing the cover.
    window.setTimeout(() => setStage("open"), 60);
  };
  const closeIt = () => {
    setStage("closing");
    window.setTimeout(() => setOpenBook(null), 460);
  };
  const shelvesRef = useRef<HTMLDivElement>(null);
  const perShelf = usePerShelf(shelvesRef);
  const reached = useReachedSteps(books.map((b) => b.id));
  const allRows = chunk(books, perShelf);
  const pageCount = Math.max(1, Math.ceil(allRows.length / SHELVES_PER_PAGE));
  const [page, setPage] = useState(0);
  const [pageKey, setPageKey] = useState(0); // bumps to replay the arrive animation
  const safePage = Math.min(page, pageCount - 1);
  const rows = allRows.slice(safePage * SHELVES_PER_PAGE, safePage * SHELVES_PER_PAGE + SHELVES_PER_PAGE);
  const goto = (p: number) => { setPage(Math.max(0, Math.min(pageCount - 1, p))); setPageKey((k) => k + 1); };
  // A new filter starts at the first shelf.
  useEffect(() => { setPage(0); }, [filter]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const lit = hoverPreviewId ?? hoverId;
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

        {/* Mantle: the writer's desk, kept on the shelf above the books */}
        <section className="bs-mantle" aria-hidden="true">
          <div className="bs-mantle-row">
            {MANTLE.map((k, i) => (
              <div key={k} className={`bs-kk bs-kk-${k}`} style={{ ["--i" as string]: i }}>
                <Knickknack kind={k} className="bs-kk-svg" />
              </div>
            ))}
          </div>
          <div className="bs-plank bs-plank-mantle">
            <span className="bs-bracket bs-bracket-l" />
            <span className="bs-bracket bs-bracket-r" />
          </div>
        </section>

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
              key={`${pageKey}-${r}`}
              perShelf={perShelf}
              arriveIndex={r}
              cards={row.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  step={stepFor(book, progressOverride, reached)}
                  lit={lit === book.id}
                  onHover={setHoverId}
                />
              ))}
            >
              {row.map((book, i) => {
                const globalIdx = (safePage * SHELVES_PER_PAGE + r) * perShelf + i;
                return (
                  <Book
                    key={book.id}
                    book={book}
                    cover={COVERS[globalIdx % COVERS.length]}
                    eraseMode={eraseMode}
                    erasing={erasingId === book.id}
                    onEraseClick={onEraseClick}
                    lit={lit === book.id}
                    onHover={setHoverId}
                    onOpen={openIt}
                    hidden={openBook?.id === book.id}
                  />
                );
              })}
            </Shelf>
          ))}
        </div>

        {openBook && (
          <BookReader
            book={openBook}
            cover={COVERS[books.indexOf(openBook) % COVERS.length]}
            ownerName={ownerName}
            step={stepFor(openBook, progressOverride, reached)}
            stage={stage}
            onClose={closeIt}
          />
        )}

        {/* Paging: wooden arrows and dots, like a shelf you walk along */}
        {!loading && pageCount > 1 && (
          <nav className="bs-pager" aria-label="Shelf pages">
            <button className="bs-nav" onClick={() => goto(safePage - 1)} disabled={safePage === 0} aria-label="Previous shelves">{"‹"}</button>
            <div className="bs-dots" role="tablist">
              {Array.from({ length: pageCount }).map((_, i) => (
                <button key={i} role="tab" aria-selected={i === safePage} className={`bs-dot${i === safePage ? " on" : ""}`} onClick={() => goto(i)} aria-label={`Shelf page ${i + 1}`} />
              ))}
            </div>
            <button className="bs-nav" onClick={() => goto(safePage + 1)} disabled={safePage === pageCount - 1} aria-label="Next shelves">{"›"}</button>
          </nav>
        )}
      </div>
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function Shelf({ perShelf, children, cards, arriveIndex = 0 }: { perShelf: number; children: ReactNode; cards?: ReactNode; arriveIndex?: number }) {
  const cols = { gridTemplateColumns: `repeat(${perShelf}, var(--bs-book-w))` };
  return (
    <section className="bs-shelf bs-arrive" style={{ ["--i" as string]: arriveIndex }}>
      <div className="bs-row bs-row-books" style={cols}>{children}</div>
      <div className="bs-plank" aria-hidden="true">
        <span className="bs-bracket bs-bracket-l" />
        <span className="bs-bracket bs-bracket-r" />
      </div>
      {cards && <div className="bs-row bs-row-cards" style={cols}>{cards}</div>}
    </section>
  );
}

function Book({ book, cover, eraseMode, erasing, onEraseClick, lit, onHover, onOpen, hidden }: {
  book: ShelfBook; cover: string; eraseMode: boolean; erasing: boolean; onEraseClick: (b: ShelfBook) => void;
  lit: boolean; onHover: (id: string | null) => void; onOpen: (b: ShelfBook) => void; hidden?: boolean;
}) {
  const hoverProps = {
    onMouseEnter: () => onHover(book.id),
    onMouseLeave: () => onHover(null),
    onFocus: () => onHover(book.id),
    onBlur: () => onHover(null),
  };
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
    <Link
      href={book.href}
      className={`bs-book-slot${lit ? " is-lit" : ""}${hidden ? " is-taken" : ""}`}
      aria-label={`Open ${book.title}`}
      onClick={(e) => {
        // Plain click opens the book in the room; modifier clicks keep the browser's own behavior.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onOpen(book);
      }}
      {...hoverProps}
    >
      <div className="bs-book-glow" />
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

function BookCard({ book, step, lit, onHover }: { book: ShelfBook; step: number; lit: boolean; onHover: (id: string | null) => void }) {
  const stamp = STAMP[book.status];
  const pct = book.status === "complete" ? 100 : Math.round(((step + 0.5) / PIPELINE_STEPS.length) * 100);
  // Fixed locale + zone so the server and the browser print the same string
  // (a runtime-locale date here is a hydration mismatch waiting to happen).
  const date = new Date(book.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <div className={`bs-card${lit ? " is-lit" : ""}`} onMouseEnter={() => onHover(book.id)} onMouseLeave={() => onHover(null)}>
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
  --bs-spring: cubic-bezier(0.2, 1.35, 0.3, 1);
  --bs-soft: cubic-bezier(0.22, 0.8, 0.2, 1);
  position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column;
  color: var(--bs-ink);
}
@media (prefers-reduced-motion: reduce) {
  .bs-root *, .bs-root *::before, .bs-root *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}

/* Shelves arrive with a spring pop, staggered top to bottom */
.bs-arrive { animation: bs-pop 640ms var(--bs-spring) both; animation-delay: calc(var(--i, 0) * 110ms); }
@keyframes bs-pop { 0% { opacity: 0; transform: translateY(18px) scale(0.96); } 100% { opacity: 1; transform: none; } }

/* Pager: wooden arrow buttons and dots */
.bs-pager { display: flex; align-items: center; justify-content: center; gap: 18px; margin-top: 34px; }
.bs-nav {
  width: 52px; height: 52px; border: 0; border-radius: 50%; cursor: pointer; padding: 0 0 5px;
  font: 800 34px/1 var(--font-manrope), sans-serif; color: #3a2410;
  background: radial-gradient(circle at 35% 30%, #ffe8b8, #e9b56b 70%, #c98a44);
  box-shadow: 0 0 0 3px #4E2E14, 0 8px 18px rgba(0,0,0,0.55), inset 0 -3px 0 #a86a2c;
  transition: transform 220ms var(--bs-spring), opacity 200ms;
}
.bs-nav:hover { transform: scale(1.08); }
.bs-nav:active { transform: scale(0.94); }
.bs-nav:disabled { opacity: 0.35; cursor: default; transform: none; }
.bs-dots { display: flex; gap: 8px; }
.bs-dot { width: 10px; height: 10px; border-radius: 50%; border: 0; padding: 0; cursor: pointer; background: rgba(249,247,242,0.35); box-shadow: 0 0 0 2px rgba(0,0,0,0.35); transition: transform 220ms var(--bs-spring), background 200ms; }
.bs-dot.on { background: #FFD97A; transform: scale(1.25); }
.bs-wall { position: fixed; inset: 0; z-index: 0; background: #2C2419; overflow: hidden; }
.bs-wall-weave {
  position: absolute; inset: 0; opacity: 0.9;
  background-image:
    repeating-linear-gradient(0deg, rgba(255,235,205,0.035) 0 1px, transparent 1px 3px),
    repeating-linear-gradient(90deg, rgba(255,235,205,0.03) 0 1px, transparent 1px 3px),
    linear-gradient(180deg, #3A2F21 0%, #2C2419 45%, #221B12 100%);
}
.bs-wall-noise { position: absolute; inset: 0; background-image: ${NOISE}; opacity: 0.07; mix-blend-mode: overlay; }
.bs-wall-noise::after {
  /* faint copper ornaments pressed into the linen: quill nibs, ink drops, asterisks */
  content: ""; position: absolute; inset: 0; opacity: 0.16;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320' fill='none' stroke='%23C17A47' stroke-width='1.4' stroke-linecap='round'%3E%3Cpath d='M40 60 l0 -14 M33 53 l14 0 M35 48 l10 10 M45 48 l-10 10'/%3E%3Cpath d='M250 40 c-6 10 -6 18 0 22 c6 -4 6 -12 0 -22z'/%3E%3Cpath d='M120 250 c14 -22 30 -34 46 -40 c-10 14 -22 30 -40 44z M124 246 l-8 8'/%3E%3Cpath d='M280 200 l0 -10 M275 195 l10 0'/%3E%3Cpath d='M70 290 c-5 8 -5 14 0 17 c5 -3 5 -9 0 -17z'/%3E%3Cpath d='M200 120 l0 -12 M194 114 l12 0 M196 110 l8 8 M204 110 l-8 8'/%3E%3C/svg%3E");
  background-size: 320px 320px;
}
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
/* Top face of the plank, seen from slightly above: a lighter lip that reads as depth */
.bs-plank::before {
  content: ""; position: absolute; left: 0; right: 0; top: -7px; height: 8px; border-radius: 3px 3px 0 0;
  background: linear-gradient(180deg, #D9A570 0%, #C48A52 100%);
  box-shadow: inset 0 1px 0 rgba(255,235,200,0.6);
}

/* Mantle shelf with the writer's things */
.bs-mantle { position: relative; margin: 26px 0 0; padding: 0 24px; }
.bs-mantle-row { display: flex; justify-content: space-around; align-items: flex-end; height: 112px; padding: 0 4%; position: relative; z-index: 2; }
.bs-kk { width: 96px; height: 96px; transform-origin: 50% 100%; }
.bs-kk-svg { width: 100%; height: 100%; display: block; overflow: visible; filter: drop-shadow(0 6px 6px rgba(0,0,0,0.45)); }
.bs-kk-lamp { width: 112px; height: 112px; }
.bs-kk-mic { width: 104px; height: 104px; }
.bs-kk-inkwell, .bs-kk-coffee { width: 84px; height: 84px; }
.bs-kk-hourglass { width: 78px; height: 78px; }
.bs-plank-mantle { top: 112px; }
.bs-mantle + .bs-shelves { margin-top: 96px; }
.kk-steam { animation: kk-steam 2.8s ease-in-out infinite; transform-origin: 50% 100%; }
.kk-steam-2 { animation-delay: 0.7s; } .kk-steam-3 { animation-delay: 1.4s; }
@keyframes kk-steam { 0% { opacity: 0; transform: translateY(4px) scale(0.9); } 40% { opacity: 1; } 100% { opacity: 0; transform: translateY(-10px) scale(1.15); } }
.kk-flame { transform-origin: 50px 40px; animation: kk-flame 1.6s ease-in-out infinite alternate; }
@keyframes kk-flame { 0% { transform: scale(1, 1) rotate(-2deg); } 50% { transform: scale(1.06, 0.94) rotate(2deg); } 100% { transform: scale(0.96, 1.08) rotate(-1deg); } }

/* Books lean a little, the way a real shelf settles */
.bs-book-slot:nth-child(3n+2) .bs-book { transform: rotate(-1.1deg); transform-origin: 50% 100%; }
.bs-book-slot:nth-child(4n+3) .bs-book { transform: rotate(0.9deg); transform-origin: 50% 100%; }
.bs-loading, .bs-empty-note { grid-column: 1 / -1; justify-self: center; align-self: end; padding-bottom: 28px; color: var(--bs-ink-soft); font-family: var(--font-lora), serif; font-style: italic; font-size: 15px; }
.bs-loading { font-style: normal; }

/* Books (same 3D book as before, now standing on wood) */
.bs-book-slot { position: relative; display: block; width: var(--bs-book-w); height: var(--bs-book-h); perspective: 1000px; text-decoration: none; outline: none; }
.bs-book { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; }
.book-hover { transition: transform 520ms var(--bs-spring); }
/* Lift: the book comes off the shelf toward you with a spring, like being picked up */
.bs-book-slot:hover .book-hover, .bs-book-slot.is-lit .book-hover { transform: translateY(-22px) translateZ(30px) rotateY(-16deg) rotateX(4deg) scale(1.04) !important; }
.bs-book-shadow {
  position: absolute; left: 12px; right: 12px; bottom: -6px; height: 16px; border-radius: 50%;
  background: radial-gradient(ellipse, rgba(0,0,0,0.55) 0%, transparent 70%); z-index: 0;
  transition: transform 520ms var(--bs-spring), opacity 520ms ease;
}
.bs-book-slot:hover .bs-book-shadow, .bs-book-slot.is-lit .bs-book-shadow { transform: translateY(10px) scaleX(1.18); opacity: 0.55; }
/* Warm glow that wakes up under a lifted book */
.bs-book-glow {
  position: absolute; left: -30px; right: -30px; top: -20px; bottom: -14px; border-radius: 50%; pointer-events: none; z-index: -1;
  background: radial-gradient(ellipse at 50% 70%, rgba(226,155,109,0.38) 0%, rgba(193,122,71,0.14) 40%, transparent 70%);
  opacity: 0; transition: opacity 420ms ease;
}
.bs-book-slot:hover .bs-book-glow, .bs-book-slot.is-lit .bs-book-glow { opacity: 1; }
.bs-book-slot:hover .bs-cover, .bs-book-slot.is-lit .bs-cover { box-shadow: 0 18px 30px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,217,122,0.35), inset 0 1px 0 rgba(255,255,255,0.1); }
.bs-book-slot:focus-visible .bs-cover { box-shadow: 0 0 0 3px #FFD97A, 0 18px 30px rgba(0,0,0,0.45); }
/* While a book is open in the room, its slot on the shelf sits empty */
.bs-book-slot.is-taken .bs-book, .bs-book-slot.is-taken .bs-book-glow { opacity: 0; transition: opacity 200ms ease; }
.bs-book-slot.is-taken .bs-book-shadow { opacity: 0.25; transform: scaleX(0.7); }
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
.bs-card { transition: transform 420ms var(--bs-spring), box-shadow 300ms ease; cursor: default; }
.bs-card.is-lit { transform: translateY(-4px); box-shadow: 3px 3px 0 rgba(0,0,0,0.35), 0 0 0 1px #FFD97A, 0 14px 26px rgba(0,0,0,0.4); }
.bs-card.is-lit .bs-progress-track i { filter: brightness(1.08); }

/* Knick-knacks wobble when poked */
.bs-kk { transition: transform 300ms var(--bs-spring); }
.bs-kk:hover { animation: bs-wobble 700ms var(--bs-spring); }
@keyframes bs-wobble { 0% { transform: rotate(0); } 25% { transform: rotate(-6deg) translateY(-6px); } 55% { transform: rotate(5deg) translateY(-3px); } 80% { transform: rotate(-2deg); } 100% { transform: rotate(0); } }
.bs-pill { transition: transform 220ms var(--bs-spring), box-shadow 160ms ease, background 160ms ease; }
.bs-pill:hover { transform: translateY(-2px) scale(1.03); }
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
  .bs-mantle { padding: 0 8px; margin-top: 18px; }
  .bs-mantle-row { height: 80px; padding: 0; }
  .bs-kk { width: 66px; height: 66px; }
  .bs-kk-lamp, .bs-kk-hourglass, .bs-kk-manuscript, .bs-kk-plant { display: none; }
  .bs-kk-mic { width: 72px; height: 72px; }
  .bs-plank-mantle { top: 80px; }
  .bs-mantle + .bs-shelves { margin-top: 70px; }
}
`;
