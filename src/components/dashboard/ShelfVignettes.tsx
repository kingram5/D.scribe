"use client";

/* eslint-disable @next/next/no-img-element */

// The used ends of each shelf, in the library's own hand. Every object is a
// painted cutout (public/shelf/*.png) generated to match THEO's library art,
// so nothing on the shelf reads as clip art. Clusters overlap at different
// sizes, the way a shelf looks when someone actually puts their things down.
// Four compositions, picked by seed so consecutive shelves never repeat.

interface Piece { src: string; x: number; h: number; z?: number; flip?: boolean; rot?: number }
interface Composition { left: Piece[]; right: Piece[] }

// x is the left edge inside a 150px zone (may spill a little); h is the height in
// px the object stands at (widths follow the image). Order is paint order.
const COMPOSITIONS: Composition[] = [
  {
    left: [{ src: "lamp", x: -8, h: 198, z: 0 }, { src: "books", x: 60, h: 109, z: 1, rot: -2 }, { src: "teacup", x: 92, h: 66, z: 2 }],
    right: [{ src: "fern", x: 40, h: 177, z: 0 }, { src: "quill", x: -6, h: 123, z: 1, flip: true }],
  },
  {
    left: [{ src: "hourglass", x: 0, h: 123, z: 0 }, { src: "candle", x: 58, h: 146, z: 1 }, { src: "books", x: 78, h: 92, z: 2, rot: 3 }],
    right: [{ src: "globe", x: 34, h: 165, z: 0 }, { src: "teacup", x: -6, h: 73, z: 1 }],
  },
  {
    left: [{ src: "fern", x: -18, h: 165, z: 0 }, { src: "quill", x: 58, h: 130, z: 1 }],
    right: [{ src: "books", x: 30, h: 142, z: 0, rot: -2 }, { src: "candle", x: 88, h: 118, z: 1 }, { src: "hourglass", x: -8, h: 99, z: 2 }],
  },
  {
    left: [{ src: "bust", x: -6, h: 160, z: 0 }, { src: "books", x: 62, h: 123, z: 1, rot: 2 }, { src: "clock", x: 96, h: 83, z: 2 }],
    right: [{ src: "lamp", x: 24, h: 184, z: 0 }, { src: "fern", x: -16, h: 127, z: 1 }],
  },
];

export function ShelfVignette({ side, seed }: { side: "left" | "right"; seed: number }) {
  const comp = COMPOSITIONS[Math.abs(seed) % COMPOSITIONS.length];
  const pieces = side === "left" ? comp.left : comp.right;
  return (
    <div className={`bs-vig bs-vig-${side}`} aria-hidden="true">
      {pieces.map((p, i) => (
        <img
          key={i}
          src={`/shelf/${p.src}.png`}
          alt=""
          className="bs-vig-piece"
          draggable={false}
          style={{
            left: p.x, height: p.h, zIndex: (p.z ?? 0) + 1,
            transform: `${p.flip ? "scaleX(-1) " : ""}rotate(${p.rot ?? 0}deg)`,
            ["--i" as string]: i,
          }}
        />
      ))}
    </div>
  );
}
