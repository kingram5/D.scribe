"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import BookReader, { type ReaderStage } from "./BookReader";
import TheoPresence from "./TheoPresence";

/** The studio's typing idiom: text arrives a character at a time behind a copper cursor. */
function useTyped(text: string, startMs = 700, cps = 28): { shown: string; done: boolean } {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(text.length); return; }
    setN(0);
    let i = 0;
    let timer = 0;
    const start = window.setTimeout(() => {
      timer = window.setInterval(() => {
        i += 1;
        setN(i);
        if (i >= text.length) window.clearInterval(timer);
      }, 1000 / cps);
    }, startMs);
    return () => { window.clearTimeout(start); if (timer) window.clearInterval(timer); };
  }, [text, startMs, cps]);
  return { shown: text.slice(0, n), done: n >= text.length };
}

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
  /** Render only the stylesheet (for galleries that reuse the sign styles). */
  stylesOnly?: boolean;
}

/** Shelves shown per page before the wooden arrows take over. */
const SHELVES_PER_PAGE = 2;

export const PIPELINE_STEPS = ["Upload", "Transcript", "Structure", "Analysis", "Generate", "Editor", "Export"];

const LEATHER = (hi: string, mid: string, lo: string) =>
  `radial-gradient(ellipse at 28% 18%, rgba(255,235,200,0.18) 0%, transparent 42%), linear-gradient(160deg, ${hi} 0%, ${mid} 45%, ${lo} 100%)`;
const COVERS = [
  LEATHER("#8A3A30", "#6E2A2A", "#3E1615"), // oxblood
  LEATHER("#2F5A46", "#244235", "#142720"), // forest
  LEATHER("#2E4A66", "#223449", "#121D2B"), // navy
  LEATHER("#7A5030", "#5A3A22", "#31200F"), // saddle brown
  LEATHER("#5E3A5E", "#4A2A47", "#2A1628"), // plum
  LEATHER("#5C5A38", "#4A4A2E", "#2A2A18"), // olive
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
      const w = el.clientWidth - 24;
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
    erasingId, loading, quote, aside, brand, progressOverride, hoverPreviewId, openPreviewId, stylesOnly,
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

  // Parallax: the wall layers drift a few pixels against the mouse so the room has
  // depth. Written to CSS variables on the root, throttled to one frame.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none)").matches) return;
    let raf = 0;
    // Pointer events, not mouse events: this is decoration that follows a hovering
    // pointer (mouse or pen), never an interaction, and touch never reaches it.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const mx = (e.clientX / window.innerWidth) * 2 - 1;
        const my = (e.clientY / window.innerHeight) * 2 - 1;
        el.style.setProperty("--mx", mx.toFixed(3));
        el.style.setProperty("--my", my.toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const isEmptyLibrary = !loading && counts.all === 0 && filter === "all";
  const isEmptyFilter = !loading && books.length === 0 && !isEmptyLibrary;

  const title = useTyped("Where were we?");
  // The book THEO offers to pick up: the most recently touched one that is not finished.
  const pickUp = books
    .filter((b) => b.status === "draft" || b.status === "in_progress")
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0];

  if (stylesOnly) return <style>{BOOKSHELF_CSS}</style>;

  const pills: { key: ShelfFilter; label: string; n: number }[] = [
    { key: "all", label: "All", n: counts.all },
    { key: "draft", label: "Draft", n: counts.draft },
    { key: "in_progress", label: "In progress", n: counts.in_progress },
    { key: "complete", label: "Complete", n: counts.complete },
    { key: "erased", label: "Erased", n: counts.erased },
  ];

  return (
    <div className="bs-root" ref={rootRef}>
      <style>{BOOKSHELF_CSS}</style>

      {/* The room: THEO's library, the same picture the brainstorm studio stands in,
          softened and scrimmed the same way, with its fire still moving. */}
      <div className="bs-wall" aria-hidden="true">
        <div className="bs-room" />
        <div className="bs-room-scrim" />
        <div className="bs-firelight" />
        <div className="bs-motes bs-motes-far" />
        <div className="bs-motes bs-motes-near" />
      </div>

      <div className="bs-scroll">
        {/* Header: hanging sign + title on the left, usage on the right */}
        <div className="bs-column">
        {/* Header in the studio's own idiom: wordmark, a mono title line, glass on the right */}
        <header className="bs-header">
          <div className="bs-header-left">
            <div className="bs-brand">{brand ?? <span className="bs-brand-fallback">D. scribe</span>}</div>
            <div className="bs-title-block">
              <div className="ds-label bs-kicker">
                {ownerName ? `${ownerName}’s library` : "Your library"}
                <span className="bs-kicker-dim"> · {counts.all} {counts.all === 1 ? "book" : "books"} · {counts.in_progress} in the works · {counts.complete} finished</span>
              </div>
              <h1 className="bs-title">
                {title.shown}
                {!title.done && <span className="ds-stage-cursor bs-title-cursor" aria-hidden="true" />}
              </h1>
              <p className="bs-quote">
                &ldquo;{quote.text}&rdquo; <span className="bs-quote-author">&mdash; {quote.author}</span>
              </p>
            </div>
          </div>
          {aside && (
            <div className="bs-header-aside">
              <div className="bs-glass bs-board">
                <div className="ds-label bs-board-label">Ink &amp; voice</div>
                <div className="bs-board-widget">{aside}</div>
              </div>
            </div>
          )}
        </header>

        {/* Toolbar: parchment filter pills + actions */}
        <div className="bs-toolbar" role="tablist" aria-label="Filter books">
          <div className="bs-pills">
            {pills.map((p, i) => (
              <button
                key={p.key}
                role="tab"
                aria-selected={filter === p.key}
                className={`bs-pill${filter === p.key ? " is-active" : ""}`}
                style={{ ["--i" as string]: i }}
                onClick={() => onFilter(p.key)}
              >
                {p.label} <span className="bs-pill-n">{p.n}</span>
              </button>
            ))}
          </div>
          <div className="bs-actions">
            <span className="bs-theo-chip ds-label" aria-label="THEO is available"><i className="bs-theo-chip-dot" />THEO is in</span>
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

        {/* The bookcase: a piece of furniture, not planks on a wall */}
        <div className="bs-case">
          <div className="bs-case-top" aria-hidden="true" />
          <div className="bs-case-side bs-case-side-l" aria-hidden="true" />
          <div className="bs-case-side bs-case-side-r" aria-hidden="true" />
        <div className="bs-shelves" ref={shelvesRef}>
          {loading && (
            <Shelf perShelf={perShelf} cards={[
              ...Array.from({ length: perShelf }).map((_, i) => <div key={i} className="bs-card bs-card-ghost" />),
              <div key="label" className="bs-loading ds-label">Dusting the shelves&hellip;</div>,
            ]}>
              {Array.from({ length: perShelf }).map((_, i) => (
                <div key={i} className="bs-book-slot bs-book-ghost" style={{ ["--i" as string]: i }}>
                  <div className="bs-book"><div className="bs-cover bs-cover-ghost" /></div>
                  <div className="bs-book-shadow" />
                </div>
              ))}
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
                  onOpen={eraseMode ? () => onEraseClick(book) : () => openIt(book)}
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
          <div className="bs-case-bottom" aria-hidden="true" />
        </div>
        </div>

        {!loading && !openBook && (
          <TheoPresence ownerName={ownerName} pickUp={pickUp ? { title: pickUp.title, href: `${pickUp.href}/upload` } : null} />
        )}

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

function Shelf({ perShelf, children, cards, arriveIndex = 0 }: {
  perShelf: number; children: ReactNode; cards?: ReactNode; arriveIndex?: number;
}) {
  const vars = { ["--i" as string]: arriveIndex, ["--bs-cols" as string]: `repeat(${perShelf}, var(--bs-book-w))` };
  return (
    <section className="bs-shelf bs-arrive" style={vars}>
      <div className="bs-row bs-row-books">
        {children}
      </div>
      <div className="bs-plank" aria-hidden="true" />
      {cards && <div className="bs-row bs-row-cards">{cards}</div>}
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
      className={`bs-book-slot${lit ? " is-lit" : ""}${hidden ? " is-taken" : ""}${book.status === "complete" ? " is-done" : ""}`}
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
          {book.status === "complete" && <span className="bs-cover-seal" aria-hidden="true">❦</span>}
        </div>
      </div>
      <div className="bs-book-shadow" />
    </Link>
  );
}

function BookCard({ book, step, lit, onHover, onOpen }: { book: ShelfBook; step: number; lit: boolean; onHover: (id: string | null) => void; onOpen: () => void }) {
  const stamp = STAMP[book.status];
  const pct = book.status === "complete" ? 100 : Math.round(((step + 0.5) / PIPELINE_STEPS.length) * 100);
  // Fixed locale + zone so the server and the browser print the same string
  // (a runtime-locale date here is a hydration mismatch waiting to happen).
  const date = new Date(book.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <div
      className={`bs-card${lit ? " is-lit" : ""}`}
      onMouseEnter={() => onHover(book.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      role="button"
      tabIndex={0}
      aria-label={`${book.title}: open`}
    >
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
/* ═══════════════════════════════════════════════════════════════════════════
   The dashboard in the brainstorm studio's language: THEO's library behind a
   scrim, dark glass panels with mono labels, copper as the single accent, the
   same spring for anything that moves. Warm palette only.
   ═══════════════════════════════════════════════════════════════════════════ */
.bs-root {
  --bs-book-w: 176px;
  --bs-book-h: 246px;
  --bs-gap: 26px;
  --bs-plank-h: 16px;
  --bs-ink: #F9F7F2;
  --bs-ink-soft: #C8C0B4;
  --bs-ink-dim: rgba(249,247,242,0.6);
  --bs-copper: #C17A47;
  --bs-copper-hi: #E29B6D;
  --bs-glass: rgba(26,22,16,0.9);
  --bs-glass-soft: rgba(26,22,16,0.72);
  --bs-line: rgba(249,247,242,0.14);
  --bs-line-soft: rgba(249,247,242,0.08);
  --bs-spring: cubic-bezier(0.2, 1.35, 0.3, 1);
  --bs-soft: cubic-bezier(0.22, 0.8, 0.2, 1);
  --mx: 0; --my: 0;
  position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column;
  color: var(--bs-ink);
}
@media (prefers-reduced-motion: reduce) {
  .bs-root *, .bs-root *::before, .bs-root *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}

/* ── The room ─────────────────────────────────────────────────────────── */
.bs-wall { position: fixed; inset: 0; z-index: 0; background: #1A1610; overflow: hidden; animation: bs-fade 900ms ease both; }
@keyframes bs-fade { from { opacity: 0; } to { opacity: 1; } }
.bs-room {
  position: absolute; inset: -4%;
  background-image: url(/theo-library.jpg); background-size: cover; background-position: center 40%;
  /* mirrored like the studio, so the hearth sits to the right of the shelves */
  transform: scaleX(-1) translate(calc(var(--mx) * 10px), calc(var(--my) * 6px));
  filter: blur(2px) brightness(0.74) saturate(1.08);
  transition: transform 900ms var(--bs-soft);
}
.bs-room-scrim { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 22%, rgba(44,36,25,0.22) 0%, rgba(26,22,16,0.6) 62%, rgba(20,16,11,0.86) 100%); }
.bs-firelight {
  position: absolute; right: -8%; bottom: -12%; width: 64%; height: 76%; pointer-events: none; mix-blend-mode: screen;
  background: radial-gradient(ellipse at 78% 92%, rgba(255,150,60,0.34) 0%, rgba(255,120,40,0.14) 32%, rgba(200,80,30,0.05) 56%, transparent 72%);
  animation: bs-firelight 2.2s ease-in-out infinite alternate;
}
@keyframes bs-firelight { 0% { opacity: 0.7; transform: scale(1); } 35% { opacity: 1; } 60% { opacity: 0.82; transform: scale(1.03); } 100% { opacity: 0.92; transform: scale(0.99); } }
.bs-motes {
  position: absolute; inset: 0; pointer-events: none; opacity: 0.55;
  background-image:
    radial-gradient(circle, rgba(255,230,190,0.9) 0 1.2px, transparent 2px),
    radial-gradient(circle, rgba(255,230,190,0.7) 0 1px, transparent 1.8px),
    radial-gradient(circle, rgba(255,230,190,0.5) 0 0.8px, transparent 1.6px);
  background-size: 260px 340px, 420px 520px, 180px 240px;
  animation: bs-motes 44s linear infinite;
}
.bs-motes-far { opacity: 0.25; animation-duration: 70s; transform: translate(calc(var(--mx) * -8px), calc(var(--my) * -5px)); transition: transform 900ms var(--bs-soft); }
.bs-motes-near { filter: blur(0.6px); transform: translate(calc(var(--mx) * -20px), calc(var(--my) * -12px)); transition: transform 700ms var(--bs-soft); }
@keyframes bs-motes { 0% { background-position: 20px 40px, 130px 200px, 60px 90px; } 100% { background-position: 60px -300px, 90px -320px, 100px -150px; } }

.bs-scroll { position: relative; z-index: 1; flex: 1; min-height: 0; overflow: hidden auto; padding: 18px 40px 72px; max-width: 100%; }
/* Everything hangs off one column the width of the case, so edges line up */
.bs-column { max-width: 1300px; margin: 0 auto; }
/* Wide rooms keep the right side clear for THEO */
@media (min-width: 1500px) { .bs-scroll { padding-right: 330px; } }
.bs-title-cursor { height: 0.9em; width: 3px; vertical-align: -0.08em; margin-left: 4px; }

/* ── Glass (the studio's panels) ──────────────────────────────────────── */
.bs-glass {
  background: var(--bs-glass); border: 1px solid var(--bs-line); border-radius: 14px;
  box-shadow: 0 18px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(249,247,242,0.05);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
}

/* ── Header ───────────────────────────────────────────────────────────── */
.bs-header { display: flex; justify-content: space-between; align-items: center; gap: 24px; flex-wrap: wrap; margin-bottom: 14px; animation: bs-drop 700ms var(--bs-spring) both; }
.bs-header-left { display: flex; align-items: center; gap: 26px; flex-wrap: wrap; }
.bs-brand { flex: none; padding: 6px 2px; }
.bs-brand-fallback { font-family: var(--font-playfair), serif; font-style: italic; font-size: 34px; color: #F7EBD3; }
.bs-title-block { max-width: 620px; border-left: 1px solid var(--bs-line); padding-left: 22px; }
.bs-kicker { color: var(--bs-ink-dim) !important; margin-bottom: 6px; }
.bs-kicker-dim { color: rgba(249,247,242,0.4); }
.bs-title { font-family: var(--font-lora), serif; font-weight: 400; font-size: 30px; letter-spacing: -0.02em; line-height: 1.08; margin: 0 0 4px; color: var(--bs-ink); }
.bs-quote { font-family: var(--font-lora), serif; font-style: italic; font-size: 13.5px; line-height: 1.5; color: var(--bs-ink-soft); margin: 0; }
.bs-quote-author { font-style: normal; font-family: var(--font-geist-mono), monospace; font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(249,247,242,0.45); margin-left: 4px; }
.bs-header-aside { min-width: 280px; max-width: 360px; flex: 0 1 360px; }
.bs-board { padding: 10px 12px 12px; }
.bs-board-label { color: var(--bs-ink-dim) !important; margin-bottom: 8px; }
.bs-board-widget { position: relative; }

/* ── Toolbar: a glass bar sitting on the case's top rail ───────────────── */
.bs-toolbar {
  display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 8px 10px; margin-bottom: 0; border-radius: 12px 12px 0 0; position: relative; z-index: 4;
  background: var(--bs-glass); border: 1px solid var(--bs-line); border-bottom: 0;
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
}
.bs-pills, .bs-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.bs-pill {
  font-family: var(--font-manrope), sans-serif; font-weight: 600; font-size: 12.5px; line-height: 1;
  padding: 9px 12px; border-radius: 9px; cursor: pointer; text-decoration: none;
  color: var(--bs-ink); background: rgba(249,247,242,0.08); border: 1px solid var(--bs-line-soft);
  transition: transform 220ms var(--bs-spring), background 160ms ease, border-color 160ms ease;
  animation: bs-pop 520ms var(--bs-spring) both; animation-delay: calc(200ms + var(--i, 0) * 45ms);
  -webkit-tap-highlight-color: transparent;
}
.bs-pill:hover { background: rgba(249,247,242,0.14); transform: translateY(-1px); }
.bs-pill:active { transform: translateY(1px); }
.bs-pill.is-active { background: var(--bs-copper); color: #fff; border-color: transparent; }
.bs-pill-n { display: inline-block; margin-left: 7px; font-family: var(--font-geist-mono), monospace; font-size: 11px; opacity: 0.7; }
.bs-pill-primary { background: var(--bs-copper); color: #fff; border-color: transparent; }
.bs-pill-primary:hover { background: #CE8A57; }
.bs-pill-ghost { background: none; color: var(--bs-ink-dim); border-color: rgba(249,247,242,0.25); }
.bs-pill-ghost.is-danger { color: #ffb4ad; border-color: #dc2626; background: rgba(220,38,38,0.12); }
.bs-erase-hint { font-family: var(--font-geist-mono), monospace; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #ffb4ad; margin: 0; padding: 6px 12px; background: rgba(220,38,38,0.12); border: 1px solid rgba(220,38,38,0.35); border-top: 0; position: relative; z-index: 4; }
/* THEO's presence chip: the studio's live-mic pulse, in copper */
.bs-theo-chip { display: inline-flex; align-items: center; gap: 8px; padding: 0 10px 0 4px; color: var(--bs-ink-dim) !important; align-self: center; }
.bs-theo-chip-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bs-copper); animation: bs-chip-pulse 2.2s ease-in-out infinite; }
@keyframes bs-chip-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(193,122,71,0.45); } 50% { box-shadow: 0 0 0 6px rgba(193,122,71,0); } }

/* ── The bookcase: dark mahogany like the room's, brass nosing, no cartoon ─ */
.bs-case {
  position: relative; margin: 0; padding: 28px 30px 24px; border-radius: 0 0 8px 8px;
  background-image:
    repeating-linear-gradient(90deg, rgba(0,0,0,0.16) 0 1px, transparent 1px 54px, rgba(255,215,170,0.035) 54px 55px, transparent 55px 108px),
    linear-gradient(180deg, #2A1A0E 0%, #1F1309 100%);
  box-shadow: inset 0 30px 50px rgba(0,0,0,0.6), inset 30px 0 50px rgba(0,0,0,0.4), inset -30px 0 50px rgba(0,0,0,0.4), 0 40px 80px rgba(0,0,0,0.6);
  animation: bs-pop 700ms var(--bs-spring) both; animation-delay: 140ms;
}
.bs-case::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: linear-gradient(250deg, rgba(255,150,60,0.14), transparent 45%); mix-blend-mode: screen; animation: bs-firelight 2.2s ease-in-out infinite alternate; }
.bs-case-top, .bs-case-bottom, .bs-case-side { position: absolute; z-index: 3; }
.bs-case-top {
  left: -10px; right: -10px; top: -8px; height: 22px; border-radius: 4px;
  background: linear-gradient(180deg, #5A3B22 0%, #43290F 55%, #2E1A0A 100%);
  box-shadow: 0 14px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,215,170,0.35), inset 0 -3px 0 rgba(0,0,0,0.35);
}
.bs-case-top::before { content: ""; position: absolute; left: 0; right: 0; top: -5px; height: 6px; border-radius: 3px 3px 0 0; background: linear-gradient(180deg, #6B4A2C, #4A2F16); }
.bs-case-top::after { content: ""; position: absolute; left: 12px; right: 12px; bottom: 5px; height: 1px; background: rgba(217,164,92,0.5); }
.bs-case-side { top: 2px; bottom: 2px; width: 24px; background: linear-gradient(90deg, #4A2F16, #3A2211 60%, #2A1608); box-shadow: inset 0 0 0 1px rgba(0,0,0,0.35); }
.bs-case-side-l { left: 0; border-radius: 3px 0 0 3px; box-shadow: inset -3px 0 0 rgba(0,0,0,0.35), inset 1px 0 0 rgba(255,215,170,0.2); }
.bs-case-side-r { right: 0; border-radius: 0 3px 3px 0; box-shadow: inset 3px 0 0 rgba(0,0,0,0.35), inset -1px 0 0 rgba(255,215,170,0.2); }
.bs-case-bottom { left: -8px; right: -8px; bottom: -12px; height: 22px; border-radius: 0 0 4px 4px; background: linear-gradient(180deg, #43290F, #24140A); box-shadow: 0 18px 30px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,215,170,0.2); }

/* Shelves */
.bs-shelves { display: flex; flex-direction: column; gap: 36px; position: relative; z-index: 2; }
.bs-shelf { position: relative; padding: 0; }
.bs-row { display: grid; justify-content: center; column-gap: var(--bs-gap); grid-template-columns: var(--bs-cols); max-width: 100%; }
.bs-row-books { align-items: end; min-height: calc(var(--bs-book-h) + 18px); position: relative; z-index: 2; }
.bs-row-cards { margin-top: calc(var(--bs-plank-h) + 12px + 14px); align-items: start; }
.bs-plank {
  position: absolute; left: 0; right: 0; top: calc(var(--bs-book-h) + 18px); height: var(--bs-plank-h); z-index: 1;
  border-radius: 2px;
  background: linear-gradient(180deg, #5C3D22 0%, #4A2F16 40%, #3A2211 100%);
  box-shadow: inset 0 1px 0 rgba(255,215,170,0.35), 0 -8px 16px rgba(0,0,0,0.3);
}
.bs-plank::before { content: ""; position: absolute; left: 0; right: 0; top: -5px; height: 6px; border-radius: 2px 2px 0 0; background: linear-gradient(180deg, #7A5232, #5C3D22); box-shadow: inset 0 1px 0 rgba(255,225,180,0.45); }
.bs-plank::after {
  content: ""; position: absolute; left: 0; right: 0; top: 100%; height: 10px; border-radius: 0 0 3px 3px;
  background: linear-gradient(180deg, #2E1A0A 0%, #1E1006 100%);
  box-shadow: 0 12px 24px rgba(0,0,0,0.65), 0 1px 0 rgba(217,164,92,0.3);
}
.bs-arrive { animation: bs-pop 640ms var(--bs-spring) both; animation-delay: calc(240ms + var(--i, 0) * 110ms); }
@keyframes bs-pop { 0% { opacity: 0; transform: translateY(18px) scale(0.96); } 100% { opacity: 1; transform: none; } }
@keyframes bs-drop { 0% { opacity: 0; transform: translateY(-24px); } 100% { opacity: 1; transform: none; } }
.bs-loading, .bs-empty-note { grid-column: 1 / -1; justify-self: center; align-self: end; padding-bottom: 28px; color: var(--bs-ink-soft); font-family: var(--font-lora), serif; font-style: italic; font-size: 15px; }
.bs-loading { font-style: normal; align-self: start; padding: 10px 0 0; letter-spacing: 0.14em; }

/* ── Books ────────────────────────────────────────────────────────────── */
.bs-book-slot { position: relative; display: block; width: var(--bs-book-w); height: var(--bs-book-h); perspective: 1000px; text-decoration: none; outline: none; -webkit-tap-highlight-color: transparent; }
.bs-book { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; }
.book-hover { transition: transform 520ms var(--bs-spring); }
.bs-book-slot:nth-child(3n+2) .bs-book { transform: rotate(-1deg); transform-origin: 50% 100%; }
.bs-book-slot:nth-child(4n+3) .bs-book { transform: rotate(0.8deg); transform-origin: 50% 100%; }
.bs-book-slot:hover .book-hover, .bs-book-slot.is-lit .book-hover { transform: translateY(-22px) translateZ(30px) rotateY(-16deg) rotateX(4deg) scale(1.04) !important; }
.bs-book-shadow {
  position: absolute; left: 12px; right: 12px; bottom: -6px; height: 16px; border-radius: 50%;
  background: radial-gradient(ellipse, rgba(0,0,0,0.6) 0%, transparent 70%); z-index: 0;
  transition: transform 520ms var(--bs-spring), opacity 520ms ease;
}
.bs-book-slot:hover .bs-book-shadow, .bs-book-slot.is-lit .bs-book-shadow { transform: translateY(10px) scaleX(1.18); opacity: 0.55; }
.bs-book-glow {
  position: absolute; left: -30px; right: -30px; top: -20px; bottom: -14px; border-radius: 50%; pointer-events: none; z-index: -1;
  background: radial-gradient(ellipse at 50% 70%, rgba(226,155,109,0.38) 0%, rgba(193,122,71,0.14) 40%, transparent 70%);
  opacity: 0; transition: opacity 420ms ease;
}
.bs-book-slot:hover .bs-book-glow, .bs-book-slot.is-lit .bs-book-glow { opacity: 1; }
.bs-book-slot:hover .bs-cover, .bs-book-slot.is-lit .bs-cover { box-shadow: 0 18px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(226,155,109,0.4), inset 0 1px 0 rgba(255,255,255,0.1); }
.bs-book-slot:focus-visible .bs-cover { box-shadow: 0 0 0 3px var(--bs-copper-hi), 0 18px 30px rgba(0,0,0,0.45); }
.bs-book-slot.is-taken .bs-book, .bs-book-slot.is-taken .bs-book-glow { opacity: 0; transition: opacity 200ms ease; }
.bs-book-slot.is-taken .bs-book-shadow { opacity: 0.25; transform: scaleX(0.7); }
.bs-back { position: absolute; inset: 0; background: #1E140C; border-radius: 2px 8px 8px 2px; transform: translateZ(-24px); }
.bs-pages { position: absolute; top: 4px; bottom: 4px; right: 0; width: 22px; background: linear-gradient(to right, #E8E0D0, #F4F1E8 30%, #EDE8DC 70%, #E0D8C8); transform: translateZ(-12px) translateX(4px); border-radius: 0 4px 4px 0; box-shadow: inset -1px 0 2px rgba(0,0,0,0.05); }
.bs-page-line { position: absolute; right: 2px; width: 16px; height: 0.5px; background: rgba(0,0,0,0.05); }
.bs-spine { position: absolute; left: -12px; top: 0; bottom: 0; width: 24px; background: linear-gradient(90deg, rgba(0,0,0,0.45), rgba(0,0,0,0.18) 30%, rgba(255,255,255,0.05) 70%, rgba(0,0,0,0.12)); transform: rotateY(90deg); transform-origin: right center; border-radius: 4px 0 0 4px; }
.bs-spine-rule { position: absolute; left: 3px; right: 3px; height: 3px; border-radius: 2px; background: linear-gradient(180deg, rgba(255,235,200,0.25), rgba(0,0,0,0.35)); box-shadow: 0 1px 0 rgba(217,164,92,0.35); }
/* Leather-bound: grain in the hide, a tooled gilt frame, a hinge strip by the spine */
.bs-cover { position: absolute; inset: 0; border-radius: 3px 10px 10px 3px; padding: 30px 18px 24px 26px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,235,200,0.12), inset -1px 0 0 rgba(0,0,0,0.25); overflow: hidden; }
.bs-cover-grain { position: absolute; inset: 0; background-image: ${NOISE}; opacity: 0.16; mix-blend-mode: overlay; pointer-events: none; }
.bs-cover::before {
  /* the hinge: a darker strip where the boards meet the spine */
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 13px; pointer-events: none;
  background: linear-gradient(90deg, rgba(0,0,0,0.42), rgba(0,0,0,0.12) 60%, rgba(255,235,200,0.06) 85%, rgba(0,0,0,0.2));
}
.bs-cover::after {
  /* gilt frame: double tooled line with corner flourishes */
  content: ""; position: absolute; inset: 9px 9px 9px 19px; pointer-events: none; border-radius: 2px;
  border: 1px solid rgba(217,164,92,0.55);
  box-shadow: inset 0 0 0 3px transparent, inset 0 0 0 4px rgba(217,164,92,0.3);
  background:
    radial-gradient(circle at 0 0, rgba(217,164,92,0.9) 0 2px, transparent 3px),
    radial-gradient(circle at 100% 0, rgba(217,164,92,0.9) 0 2px, transparent 3px),
    radial-gradient(circle at 0 100%, rgba(217,164,92,0.9) 0 2px, transparent 3px),
    radial-gradient(circle at 100% 100%, rgba(217,164,92,0.9) 0 2px, transparent 3px);
}
.bs-cover-rule { position: absolute; left: 24px; right: 14px; height: 1px; background: linear-gradient(to right, transparent, rgba(217,164,92,0.5), transparent); }
.bs-cover-rule-top { top: 18px; } .bs-cover-rule-bottom { bottom: 18px; }
.bs-cover-body { position: relative; z-index: 1; }
.bs-cover-dash { width: 26px; height: 1px; background: linear-gradient(90deg, #C9A25C, #F7E2B0, #C9A25C); margin-bottom: 14px; box-shadow: 0 1px 0 rgba(0,0,0,0.5); }
.bs-cover-title {
  font-family: var(--font-playfair), var(--font-lora), serif; font-style: italic; font-size: 19px; font-weight: 500; line-height: 1.2; margin: 0 0 8px;
  background-image: linear-gradient(170deg, #F7E2B0 0%, #E3C27E 35%, #C9A25C 60%, #F4D69C 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 1px 0 rgba(0,0,0,0.65));
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
}
.bs-cover-audience { font-family: var(--font-geist-mono), monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: rgba(217,164,92,0.75); margin: 0; text-shadow: 0 1px 0 rgba(0,0,0,0.6); }
.bs-cover-dim { position: absolute; inset: 0; background: rgba(0,0,0,0.26); border-radius: inherit; pointer-events: none; }
/* In progress: a silk ribbon bookmark hangs out of the top edge */
.bs-cover-strip {
  position: absolute; top: -2px; right: 22px; width: 11px; height: 58px; pointer-events: none; z-index: 2;
  background: linear-gradient(90deg, #A8572E, #D98B58 45%, #A8572E); border-radius: 0 0 1px 1px;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 84%, 0 100%);
  box-shadow: 2px 3px 6px rgba(0,0,0,0.5);
}
/* Finished: gilded page edges and a small gold fleuron */
.bs-book-slot.is-done .bs-pages { background: linear-gradient(to right, #C9A25C, #F4D69C 30%, #E3C27E 70%, #B88A44); }
.bs-cover-seal { position: absolute; right: 14px; bottom: 12px; font-size: 15px; color: #E3C27E; text-shadow: 0 1px 0 rgba(0,0,0,0.6); z-index: 2; }
.bs-erase-overlay { position: absolute; inset: 0; background: rgba(220,38,38,0.65); border-radius: 2px 12px 12px 2px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #fff; }
.bs-erase-glyph { font-size: 28px; } .bs-erase-title { font-size: 11px; font-weight: 700; text-align: center; padding: 0 12px; }

/* Ghost book (empty library) and loading ghosts */
.bs-ghost-book {
  width: var(--bs-book-w); height: var(--bs-book-h); border-radius: 2px 12px 12px 2px;
  border: 1.5px dashed rgba(249,247,242,0.35); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  color: var(--bs-ink); text-decoration: none; background: rgba(249,247,242,0.04); position: relative; z-index: 2;
  grid-column: 1 / -1; justify-self: center;
  transition: background 200ms ease, transform 300ms ease;
}
.bs-ghost-book:hover { background: rgba(193,122,71,0.14); transform: translateY(-6px); }
.bs-ghost-plus { font-size: 36px; line-height: 1; color: var(--bs-copper); }
.bs-ghost-title { font-family: var(--font-playfair), serif; font-style: italic; font-size: 20px; }
.bs-ghost-sub { font-family: var(--font-geist-mono), monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--bs-ink-soft); }
.bs-book-ghost { animation: bs-pop 600ms var(--bs-spring) both; animation-delay: calc(var(--i, 0) * 80ms); }
.bs-cover-ghost { background: linear-gradient(160deg, rgba(249,247,242,0.10), rgba(249,247,242,0.04)); border: 1px dashed rgba(249,247,242,0.25); box-shadow: none; overflow: hidden; }
.bs-cover-ghost::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,214,150,0.14) 50%, transparent 70%); animation: bs-shimmer 1.8s ease-in-out infinite; }
@keyframes bs-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }

/* ── Cards: the studio's glass, one per book ──────────────────────────── */
.bs-card {
  background: var(--bs-glass-soft); color: var(--bs-ink); border-radius: 12px; padding: 10px 12px 9px;
  border: 1px solid var(--bs-line); box-shadow: 0 12px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(249,247,242,0.04);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  position: relative; cursor: pointer; -webkit-tap-highlight-color: transparent;
  transition: transform 420ms var(--bs-spring), box-shadow 300ms ease, border-color 300ms ease;
}
.bs-card.is-lit { transform: translateY(-4px); border-color: rgba(226,155,109,0.55); box-shadow: 0 16px 30px rgba(0,0,0,0.45), 0 0 0 1px rgba(226,155,109,0.25); }
.bs-card-wide { grid-column: 1 / -1; justify-self: center; width: min(100%, 520px); }
.bs-card-ghost { min-height: 92px; opacity: 0.45; }
.bs-card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.bs-card-title { font-family: var(--font-lora), serif; font-weight: 500; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bs-card-date { font-family: var(--font-geist-mono), monospace; font-size: 10px; color: rgba(249,247,242,0.45); white-space: nowrap; }
.bs-card-audience { margin-top: 2px; color: rgba(249,247,242,0.5) !important; }
.bs-progress { margin: 9px 0 7px; }
.bs-progress-track { height: 5px; border-radius: 3px; background: rgba(249,247,242,0.12); overflow: hidden; }
.bs-progress-track i { display: block; width: 100%; height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--bs-copper-hi), var(--bs-copper)); transform-origin: left center; transition: transform 600ms cubic-bezier(0.2,1,0.3,1); }
.bs-pips { display: flex; gap: 4px; margin-top: 6px; }
.bs-pips i { width: 8px; height: 8px; border-radius: 50%; background: rgba(249,247,242,0.16); }
.bs-pips i.on { background: var(--bs-copper); box-shadow: 0 0 6px rgba(226,155,109,0.5); }
.bs-card-foot { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.bs-card-foot .ds-stamp { white-space: nowrap; font-size: 10px; letter-spacing: 0.1em; }
.bs-card-step { font-family: var(--font-geist-mono), monospace; font-size: 10px; letter-spacing: 0.06em; color: rgba(249,247,242,0.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bs-steps { list-style: none; margin: 8px 0 6px; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 5px 14px; font-family: var(--font-manrope), sans-serif; font-size: 12.5px; color: var(--bs-ink-soft); }
.bs-steps li { display: flex; align-items: center; gap: 8px; }
.bs-step-n { width: 18px; height: 18px; border-radius: 50%; background: var(--bs-copper); color: #fff; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.bs-steps-note { font-family: var(--font-lora), serif; font-style: italic; font-size: 12.5px; color: var(--bs-ink-soft); margin: 6px 0 0; }

/* ── Pager ────────────────────────────────────────────────────────────── */
.bs-pager { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 34px; }
.bs-nav {
  width: 46px; height: 46px; border-radius: 12px; cursor: pointer; padding: 0 0 4px;
  font: 700 26px/1 var(--font-manrope), sans-serif; color: var(--bs-ink);
  background: rgba(249,247,242,0.08); border: 1px solid var(--bs-line);
  transition: transform 220ms var(--bs-spring), background 160ms;
}
.bs-nav:hover { background: rgba(249,247,242,0.14); transform: translateY(-1px); }
.bs-nav:active { transform: translateY(1px); }
.bs-nav:disabled { opacity: 0.3; cursor: default; transform: none; }
.bs-dots { display: flex; gap: 8px; }
.bs-dot { width: 8px; height: 8px; border-radius: 50%; border: 0; padding: 0; cursor: pointer; background: rgba(249,247,242,0.25); transition: transform 220ms var(--bs-spring), background 200ms; }
.bs-dot.on { background: var(--bs-copper-hi); transform: scale(1.3); }

/* Keyboard */
.bs-pill:focus-visible, .bs-nav:focus-visible, .bs-dot:focus-visible, .bs-card:focus-visible, .bs-ghost-book:focus-visible { outline: 2px solid var(--bs-copper-hi); outline-offset: 3px; }

/* ── Phones ───────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .bs-root { --bs-book-w: 150px; --bs-book-h: 210px; --bs-gap: 20px; --bs-plank-h: 12px; }
  .bs-scroll { padding: 12px 16px 96px; overflow: visible; overflow-x: clip; }
  .bs-room { filter: blur(3px) brightness(0.5) saturate(1.05); }
  .bs-title { font-size: 28px; }
  .bs-header { gap: 14px; }
  .bs-header-left { gap: 14px; }
  .bs-title-block { border-left: 0; padding-left: 0; }
  .bs-header-aside { min-width: 0; max-width: none; flex-basis: 100%; }
  .bs-case { padding: 20px 12px 16px; }
  .bs-case-side { width: 12px; }
  .bs-case-top { left: -6px; right: -6px; top: -8px; height: 18px; }
  .bs-case-bottom { left: -5px; right: -5px; bottom: -10px; height: 14px; }
  .bs-shelves { gap: 30px; }
  .bs-cover { padding: 18px 14px; }
  .bs-cover-title { font-size: 17px; }
  .bs-card-wide { grid-column: 1 / -1; }
  .bs-steps { grid-template-columns: 1fr; }
}
`;
