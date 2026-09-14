"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Bookshelf, { type ShelfBook, type ShelfFilter } from "@/components/dashboard/Bookshelf";
import { readConsent, writeConsent } from "@/lib/consent";

const MOCK: ShelfBook[] = [
  { id: "a", title: "The Weight of a Quiet Yes", audience: "Faith Community", status: "in_progress", updated_at: "2026-09-12T14:00:00Z", href: "#" },
  { id: "b", title: "Build the Room Before the Crowd", audience: "Business/Leadership", status: "complete", updated_at: "2026-08-30T14:00:00Z", href: "#" },
  { id: "c", title: "Forty Sermons on Ordinary Tuesdays", audience: "Faith Community", status: "draft", updated_at: "2026-09-14T09:30:00Z", href: "#" },
  { id: "d", title: "Say It Once, Say It Whole", audience: "Self-Help", status: "in_progress", updated_at: "2026-09-08T14:00:00Z", href: "#" },
  { id: "e", title: "Notes From the Back Row", audience: "Memoir & Biography", status: "draft", updated_at: "2026-09-01T14:00:00Z", href: "#" },
  { id: "f", title: "The Long Table", audience: "General", status: "in_progress", updated_at: "2026-09-10T14:00:00Z", href: "#" },
  { id: "g", title: "What the Kitchen Knew", audience: "Memoir & Biography", status: "complete", updated_at: "2026-07-22T14:00:00Z", href: "#" },
];

const PROGRESS: Record<string, number> = { a: 3, c: 0, d: 4, e: 1, f: 5 };

export default function BookshelfDemo() {
  const params = useSearchParams();
  const empty = params.get("empty") === "1";
  const [filter, setFilter] = useState<ShelfFilter>("all");
  const [eraseMode, setEraseMode] = useState(false);
  // Dev harness only: decline non-essential cookies up front so the consent banner
  // (a sibling mounted after this page) does not cover the shelf in screenshots.
  useEffect(() => { if (readConsent() === null) writeConsent({ analytics: false, marketing: false }); }, []);
  const all = empty ? [] : MOCK;
  const active = all.filter((b) => b.status !== "erased");
  const books = filter === "all" ? active : all.filter((b) => b.status === filter);
  const counts = {
    all: active.length,
    draft: all.filter((b) => b.status === "draft").length,
    in_progress: all.filter((b) => b.status === "in_progress").length,
    complete: all.filter((b) => b.status === "complete").length,
    erased: 0,
  };
  return (
    <div className="ds-main-layout" style={{ height: "100dvh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 44, flex: "none", background: "rgba(20,15,10,0.6)", borderBottom: "1px solid rgba(249,247,242,0.08)" }} />
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
          loading={false}
          quote={{ text: "Write what should not be forgotten.", author: "Isabel Allende" }}
          progressOverride={PROGRESS}
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
