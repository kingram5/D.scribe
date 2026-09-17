"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Bookshelf, { type ShelfBook, type ShelfFilter } from "@/components/dashboard/Bookshelf";
import Wordmark, { WORDMARK_VARIANTS, type WordmarkVariant } from "@/components/dashboard/Wordmark";
import { readConsent, writeConsent } from "@/lib/consent";
import OsBar from "@/components/ui/OsBar";

/** ?logos=1: every wordmark reading on its own sign, side by side, for picking. */
function LogoGallery() {
  return (
    <div style={{ minHeight: "100dvh", background: "#2C2419", padding: 40, display: "flex", flexWrap: "wrap", gap: 48, alignItems: "flex-start", justifyContent: "center" }}>
      {WORDMARK_VARIANTS.map((v) => (
        <div key={v} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div className="bs-root" style={{ display: "block" }}>
            <div className="bs-glass" style={{ padding: "18px 26px" }}><Wordmark variant={v} width={280} /></div>
          </div>
          <div className="ds-label" style={{ color: "#C8C0B4" }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

const MOCK: ShelfBook[] = [
  { id: "a", title: "The Weight of a Quiet Yes", audience: "Faith Community", status: "in_progress", updated_at: "2026-09-12T14:00:00Z", href: "#" },
  { id: "b", title: "Build the Room Before the Crowd", audience: "Business/Leadership", status: "complete", updated_at: "2026-08-30T14:00:00Z", href: "#" },
  { id: "c", title: "Forty Sermons on Ordinary Tuesdays", audience: "Faith Community", status: "draft", updated_at: "2026-09-14T09:30:00Z", href: "#" },
  { id: "d", title: "Say It Once, Say It Whole", audience: "Self-Help", status: "in_progress", updated_at: "2026-09-08T14:00:00Z", href: "#" },
  { id: "e", title: "Notes From the Back Row", audience: "Memoir & Biography", status: "draft", updated_at: "2026-09-01T14:00:00Z", href: "#" },
  { id: "f", title: "The Long Table", audience: "General", status: "in_progress", updated_at: "2026-09-10T14:00:00Z", href: "#" },
  { id: "g", title: "What the Kitchen Knew", audience: "Memoir & Biography", status: "complete", updated_at: "2026-07-22T14:00:00Z", href: "#" },
  { id: "h", title: "Ordinary Miracles", audience: "Faith Community", status: "draft", updated_at: "2026-08-14T14:00:00Z", href: "#" },
  { id: "i", title: "Ninety Days of Saying No", audience: "Self-Help", status: "in_progress", updated_at: "2026-08-19T14:00:00Z", href: "#" },
  { id: "j", title: "The Founder's Kitchen Table", audience: "Business/Leadership", status: "in_progress", updated_at: "2026-09-02T14:00:00Z", href: "#" },
  { id: "k", title: "Letters I Never Mailed", audience: "Memoir & Biography", status: "draft", updated_at: "2026-06-30T14:00:00Z", href: "#" },
  { id: "l", title: "A Short Theology of Rest", audience: "Faith Community", status: "complete", updated_at: "2026-05-11T14:00:00Z", href: "#" },
];

const PROGRESS: Record<string, number> = { a: 3, c: 0, d: 4, e: 1, f: 5, h: 0, i: 2, j: 4, k: 1 };

export default function BookshelfDemo() {
  const params = useSearchParams();
  const empty = params.get("empty") === "1";
  const [filter, setFilter] = useState<ShelfFilter>("all");
  const [eraseMode, setEraseMode] = useState(false);
  // Dev harness only: decline non-essential cookies up front so the consent banner
  // (a sibling mounted after this page) does not cover the shelf in screenshots.
  useEffect(() => { if (readConsent() === null) writeConsent({ analytics: false, marketing: false }); }, []);
  const debug = params.get("debug") === "1";
  const [measure, setMeasure] = useState("");
  useEffect(() => {
    if (!debug) return;
    const t = setTimeout(() => {
      const r = (sel: string) => { const el = document.querySelector(sel); if (!el) return `${sel}: none`; const b = el.getBoundingClientRect(); return `${sel}: x=${Math.round(b.left)} w=${Math.round(b.width)}`; };
      setMeasure([
        `viewport innerWidth=${window.innerWidth} docScrollW=${document.documentElement.scrollWidth} bodyW=${document.body.clientWidth}`,
        r(".ds-main-layout"), r(".ds-page-shell"), r(".bs-root"), r(".bs-scroll"), r(".bs-header"), r(".bs-toolbar"), r(".bs-shelves"), r(".bs-shelf"), r(".bs-row-books"), r(".bs-book-slot"),
      ].join("\n"));
    }, 800);
    return () => clearTimeout(t);
  }, [debug]);
  // ?n=3 seeds a part-filled shelf, for checking when the step pads drop away.
  const n = Number(params.get("n"));
  const all = empty ? [] : (Number.isFinite(n) && n > 0 ? MOCK.slice(0, n) : MOCK);
  const logo = (params.get("logo") as WordmarkVariant | null) ?? "underline";
  const active = all.filter((b) => b.status !== "erased");
  const books = filter === "all" ? active : all.filter((b) => b.status === filter);
  const counts = {
    all: active.length,
    draft: all.filter((b) => b.status === "draft").length,
    in_progress: all.filter((b) => b.status === "in_progress").length,
    complete: all.filter((b) => b.status === "complete").length,
    erased: 0,
  };
  if (params.get("logos") === "1") {
    return (
      <>
        <Bookshelf ownerName="" books={[]} counts={{ all: 0, draft: 0, in_progress: 0, complete: 0, erased: 0 }} filter="all" onFilter={() => {}} eraseMode={false} onToggleErase={() => {}} onEraseClick={() => {}} erasingId={null} loading={false} quote={{ text: "", author: "" }} stylesOnly />
        <LogoGallery />
      </>
    );
  }
  return (
    <div className="ds-main-layout" style={{ height: "100dvh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {debug && <pre style={{ position: "fixed", top: 0, left: 0, zIndex: 9999, background: "#000", color: "#0f0", fontSize: 11, margin: 0, padding: 6, whiteSpace: "pre-wrap" }}>{measure || "measuring…"}</pre>}
      <OsBar />
      <div style={{ height: 44, flex: "none" }} />
      <div className="ds-page-shell" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Bookshelf
          ownerName="Kyle"
          books={books}
          counts={counts}
          filter={filter}
          onFilter={setFilter}
          eraseMode={eraseMode}
          onToggleErase={() => setEraseMode((v) => !v)}
          onEraseClick={() => setEraseMode(false)}
          erasingId={null}
          loading={params.get("loading") === "1"}
          quote={{ text: "Write what should not be forgotten.", author: "Isabel Allende" }}
          progressOverride={PROGRESS}
          brand={<Wordmark variant={logo} width={390} />}
          hoverPreviewId={params.get("hover") ?? undefined}
          openPreviewId={params.get("open") ?? undefined}
          aside={
            <div className="plate-card" style={{ padding: "12px 16px", background: "#FBF9F3", color: "#2C2419" }}>
              <div className="ds-label">Usage widget renders here</div>
              <div style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 13, marginTop: 6 }}>Ink 42.0 &middot; Voice 12 min left</div>
            </div>
          }
        />
      </div>
    </div>
  );
}
