"use client";

// D.Scribe's orb: thinking-orbs' animations painted in our palette.
//
// The package only offers theme="dark|light", which paints greyscale ink — there is no
// colour prop. But it exports its draw primitives (MODE_DRAWS + resolvePreset), and every
// mode paints `rgba(r,r,r,alpha)`. So we run the same frame loop the component runs, then
// composite our colour with `source-in`: RGB is replaced, alpha is untouched. The result is
// the real animation in burnt orange, not a filter approximation of it.

import { useEffect, useRef } from "react";
import { MODE_DRAWS, resolvePreset, type OrbState, type OrbSize } from "thinking-orbs";

interface TheoOrbProps {
  state?: OrbState;
  /** The package ships exactly two tuned designs; they are not a scale factor. */
  size?: OrbSize;
  /**
   * Rendered width/height in CSS px. Defaults to `size`. The tuned design is still
   * resolved at `size` (dot count, dot size and speed are hand-tuned per preset) and then
   * drawn at `display / size` scale, so it grows crisply instead of being a stretched bitmap.
   */
  display?: number;
  /** Animation speed multiplier on top of the preset's baked speed. */
  speed?: number;
  /** Any CSS colour. Defaults to D.Scribe burnt orange. */
  color?: string;
  paused?: boolean;
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
}

const BURNT_ORANGE = "#C17A47";

export default function TheoOrb({
  state = "listening",
  size = 64,
  display,
  speed = 1,
  color = BURNT_ORANGE,
  paused = false,
  className,
  style,
  "aria-label": ariaLabel,
}: TheoOrbProps) {
  const rendered = display ?? size;
  const ref = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const dpr = Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
    // Backing store covers the RENDERED size so a scaled-up orb stays sharp.
    canvas.width = Math.round(rendered * dpr);
    canvas.height = Math.round(rendered * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Preset is always resolved at the tuned size; `k` scales the drawing, not the design.
    const { mode, speed: presetSpeed, opts } = resolvePreset(state, size);
    const draw = MODE_DRAWS[mode];
    const rate = presetSpeed * speed;
    const k = rendered / size;

    const paint = (t: number) => {
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      ctx.clearRect(0, 0, size, size);
      // dark=true paints the light-ink variant: full-strength greyscale, the cleanest
      // possible mask for the tint below.
      draw(ctx, size, t, true, opts);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = "source-over";
    };

    // Respect reduced motion: paint one representative frame and stop.
    const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { paint(0.6); return; }

    let raf = 0;
    let running = false;
    const frame = () => {
      paint((performance.now() / 1000) * rate);
      if (running) raf = requestAnimationFrame(frame);
    };
    const start = () => { if (!running && !pausedRef.current) { running = true; raf = requestAnimationFrame(frame); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    paint((performance.now() / 1000) * rate);

    // Don't burn a RAF loop on an orb nobody can see — the package does the same.
    let visible = true;
    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([e]) => {
          visible = e.isIntersecting;
          if (visible && document.visibilityState !== "hidden") start(); else stop();
        })
      : null;
    io?.observe(canvas);
    const onVis = () => {
      if (document.visibilityState === "hidden") stop();
      else if (visible) start();
    };
    document.addEventListener("visibilitychange", onVis);
    if (!io) start();

    return () => {
      stop();
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [state, size, rendered, speed, color, paused]);

  return (
    <canvas
      ref={ref}
      className={className}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      style={{ width: rendered, height: rendered, display: "block", ...style }}
    />
  );
}
