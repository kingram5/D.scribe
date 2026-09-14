"use client";

import { Knickknack, type KnickknackKind } from "./Knickknacks";

// The ends of a used shelf. Instead of a lineup of single objects on their own
// plank, the books are flanked by small clusters: things stacked on things,
// leaning, overlapping, at different sizes, the way a shelf looks when someone
// actually puts their stuff down on it. Four compositions, chosen by seed so
// consecutive shelves never repeat. A brass bookend holds the row on the inner
// side of each cluster.

interface Piece { kind: KnickknackKind; x: number; size: number; rot?: number; z?: number; flip?: boolean }
interface Composition { left: Piece[]; right: Piece[] }

// x is the piece's left edge inside a 150px zone; sizes are the SVG box (objects
// stand on the zone floor and are allowed to spill a little past the zone, the
// bookend covers the seam). Order in the array is paint order.
const COMPOSITIONS: Composition[] = [
  {
    left: [
      { kind: "lamp", x: -14, size: 150, z: 0 },
      { kind: "manuscript", x: 46, size: 118, rot: -3, z: 1 },
      { kind: "coffee", x: 74, size: 78, z: 2 },
    ],
    right: [
      { kind: "plant", x: 34, size: 140, z: 0 },
      { kind: "inkwell", x: -6, size: 100, z: 1, flip: true },
    ],
  },
  {
    left: [
      { kind: "hourglass", x: 0, size: 96, z: 0 },
      { kind: "candle", x: 50, size: 116, z: 1 },
      { kind: "manuscript", x: 78, size: 88, rot: 4, z: 2 },
    ],
    right: [
      { kind: "mic", x: 30, size: 136, z: 0 },
      { kind: "coffee", x: -4, size: 74, z: 1 },
    ],
  },
  {
    left: [
      { kind: "plant", x: -16, size: 132, z: 0 },
      { kind: "inkwell", x: 56, size: 106, z: 1 },
    ],
    right: [
      { kind: "manuscript", x: 34, size: 124, rot: -2, z: 0 },
      { kind: "candle", x: 76, size: 92, z: 1 },
      { kind: "hourglass", x: -4, size: 78, z: 2 },
    ],
  },
  {
    left: [
      { kind: "mic", x: -10, size: 132, z: 0 },
      { kind: "manuscript", x: 50, size: 100, rot: 3, z: 1 },
      { kind: "coffee", x: 82, size: 68, z: 2 },
    ],
    right: [
      { kind: "lamp", x: 22, size: 142, z: 0 },
      { kind: "plant", x: -12, size: 98, z: 1 },
    ],
  },
];

export function ShelfVignette({ side, seed }: { side: "left" | "right"; seed: number }) {
  const comp = COMPOSITIONS[Math.abs(seed) % COMPOSITIONS.length];
  const pieces = side === "left" ? comp.left : comp.right;
  return (
    <div className={`bs-vig bs-vig-${side}`} aria-hidden="true">
      {pieces.map((p, i) => (
        <div
          key={i}
          className="bs-vig-piece"
          style={{
            left: p.x, width: p.size, height: p.size, zIndex: (p.z ?? 0) + 1,
            transform: `${p.flip ? "scaleX(-1) " : ""}rotate(${p.rot ?? 0}deg)`,
            ["--i" as string]: i,
          }}
        >
          <Knickknack kind={p.kind} className="bs-kk-svg" />
        </div>
      ))}
      <Bookend side={side} />
    </div>
  );
}

/** A brass bookend on the inner edge of the cluster, holding the row of books. */
function Bookend({ side }: { side: "left" | "right" }) {
  return (
    <svg viewBox="0 0 60 100" className={`bs-bookend bs-bookend-${side}`} aria-hidden="true">
      <defs>
        <linearGradient id={`be-${side}`} x1="0" x2="1">
          <stop offset="0" stopColor="#F0D6A8" />
          <stop offset="0.5" stopColor="#D9A45C" />
          <stop offset="1" stopColor="#8A6A3A" />
        </linearGradient>
      </defs>
      <ellipse cx="30" cy="98" rx="26" ry="3" fill="rgba(0,0,0,0.45)" />
      <path d={side === "left" ? "M4 96 h52 v-8 h-30 v-70 a8 8 0 0 0 -16 0 z" : "M4 96 h52 v-8 h-6 v-70 a8 8 0 0 0 -16 0 v70 h-30 z"} fill={`url(#be-${side})`} stroke="#5A3F1A" strokeWidth="1" />
      <circle cx={side === "left" ? 18 : 42} cy="26" r="4" fill="#5A3F1A" opacity="0.5" />
    </svg>
  );
}
