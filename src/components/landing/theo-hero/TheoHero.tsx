"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  RIBBON_ITEMS,
  THEO_HERO_COPY,
  THEO_HERO_MEDIA,
  type RibbonItem,
  type TheoHeroMedia,
} from "./theo-hero-config";
import { THEO_HERO_CSS } from "./theo-hero-styles";

/**
 * PREVIEW hero (/hero-preview only). Layer order, back to front:
 *   stage (dark + spotlight) < ribbon of covers < T.H.E.O cutout < copy.
 *
 * The whole timeline (T.H.E.O fades in, ribbon sweeps in behind his head,
 * headline then CTA fade in) is CSS animation-delay, so it never waits on
 * hydration and reduced-motion is one `animation: none`. JS only does the
 * still -> video swap and the off-screen pause.
 *
 * Hard rules from earlier T.H.E.O builds: the cutout never moves, scales or
 * pans (it reads as the character drifting). Motion comes from the ribbon and
 * from fades. The video is pre-rolled before it is revealed.
 */

// Lead time between the video actually playing and revealing it, so the
// dissolve is between two moving images, never into a frozen first frame.
const PREROLL_MS = 260;
// Ribbon: one lap along the visible arc. Must match --th-lap in theo-hero-styles.ts.
const LAP_S = 72;
const ARC_DEG = 100; // the arc runs -ARC_DEG..+ARC_DEG, fading at both ends
const EDGE_FADE = 0.14; // fraction of the lap spent fading in / out
const PHONE_MQ = "(max-width: 767px)";

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Safari and every iOS browser are WebKit, and none of them composite VP9
 * alpha (Safari 17.4+ decodes the webm but paints it opaque). Skip the webm
 * there entirely rather than download it just to fail the probe.
 */
function isAppleWebKit() {
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg\/|OPR\/|Android/.test(ua);
}

function pickSource(media: TheoHeroMedia, isPhone: boolean): string | null {
  const probe = document.createElement("video");
  if (isAppleWebKit()) {
    return media.hevcAlpha && probe.canPlayType('video/mp4; codecs="hvc1"') ? media.hevcAlpha : null;
  }
  if (!probe.canPlayType('video/webm; codecs="vp9"')) return null;
  return isPhone && media.webmSmall ? media.webmSmall : media.webm;
}

function saveDataOrSlow() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType ?? ""));
}

/**
 * Draw a frame that should be transparent and read the alpha byte. Top-left
 * is background in every frame of these cutouts. Fails SAFE: anything other
 * than proven alpha keeps the still.
 */
function alphaComposites(v: HTMLVideoElement) {
  if (!v.videoWidth) return false;
  try {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return false;
    g.clearRect(0, 0, 8, 8);
    g.drawImage(v, 0, 0, 8, 8);
    return g.getImageData(0, 0, 1, 1).data[3] < 250;
  } catch {
    return false;
  }
}

function RibbonCard({ item }: { item: RibbonItem }) {
  if (item.kind === "page") {
    return (
      <div className="th-page">
        <div className="th-page-chapter">{item.chapter}</div>
        <div className="th-page-rule" />
        <p className="th-page-first">{item.firstLine}</p>
        <div className="th-page-lines" />
      </div>
    );
  }
  return (
    <div className="th-cover" style={{ background: item.cover }}>
      <div className="th-cover-hair th-cover-hair--top" />
      <div>
        <div className="th-cover-kicker">{item.kicker}</div>
        <div className="th-cover-title">{item.title}</div>
      </div>
      <div className="th-cover-hair th-cover-hair--bottom" />
      <span className="th-cover-seal" aria-hidden="true">❦</span>
    </div>
  );
}

export default function TheoHero({ media = THEO_HERO_MEDIA }: { media?: TheoHeroMedia } = {}) {
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [videoOn, setVideoOn] = useState(false);

  // Still first, video after the page has loaded and gone idle.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || prefersReducedMotion() || saveDataOrSlow()) return;
    let cancelled = false;
    let revealTimer = 0;
    let idleHandle: { kind: "idle" | "timeout"; id: number } | null = null;

    const giveUp = () => {
      v.pause();
      v.removeAttribute("src");
      v.load(); // stop the download
    };

    const onLoadedData = () => {
      if (!alphaComposites(v)) giveUp(); // e.g. a WebKit build that slipped through
    };
    const onPlaying = () => {
      window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(() => {
        if (!cancelled && !v.paused && alphaComposites(v)) setVideoOn(true);
      }, PREROLL_MS);
    };
    const onError = () => giveUp();

    const start = () => {
      if (cancelled) return;
      const src = pickSource(media, window.matchMedia(PHONE_MQ).matches);
      if (!src) return; // Apple WebKit without an HEVC-alpha file: hold the still
      v.loop = media.loop;
      v.addEventListener("loadeddata", onLoadedData);
      v.addEventListener("playing", onPlaying, { once: true });
      v.addEventListener("error", onError);
      v.src = src;
      if (rootRef.current?.dataset.paused !== "true") v.play().catch(() => {});
    };

    const afterLoad = () => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      idleHandle = w.requestIdleCallback
        ? { kind: "idle", id: w.requestIdleCallback(start, { timeout: 2500 }) }
        : { kind: "timeout", id: window.setTimeout(start, 600) };
    };
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });

    return () => {
      cancelled = true;
      window.clearTimeout(revealTimer);
      window.removeEventListener("load", afterLoad);
      const w = window as Window & { cancelIdleCallback?: (h: number) => void };
      if (idleHandle?.kind === "idle") w.cancelIdleCallback?.(idleHandle.id);
      if (idleHandle?.kind === "timeout") window.clearTimeout(idleHandle.id);
      v.removeEventListener("loadeddata", onLoadedData);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("error", onError);
    };
  }, [media]);

  // Off-screen: stop video decode and the ribbon's animations.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const v = videoRef.current;
        if (entry.isIntersecting) {
          root.dataset.paused = "false";
          if (v && v.getAttribute("src") && !prefersReducedMotion()) v.play().catch(() => {});
        } else {
          root.dataset.paused = "true";
          v?.pause();
        }
      },
      { threshold: 0.05 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  // Phone: the flat row starts centred so covers peek out on both sides of his head.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || !window.matchMedia(PHONE_MQ).matches) return;
    row.scrollLeft = Math.max(0, (row.scrollWidth - row.clientWidth) / 2);
  }, []);

  const n = RIBBON_ITEMS.length;
  const { still } = media;

  return (
    <section ref={rootRef} className="th-hero" aria-labelledby="th-headline" data-paused="false">
      {/* First child, so every layer below is styled at first paint. */}
      <style>{THEO_HERO_CSS}</style>
      <div className="th-stage" aria-hidden="true">
        <div className="th-stage-glow" />
      </div>

      {/* Ribbon. View = perspective + fade + edge mask (safe to flatten);
          sweep = preserve-3d wrapper that rotates the ring in; cards orbit. */}
      <div ref={rowRef} className="th-ribbon-view" aria-hidden="true">
        <div className="th-ribbon-sweep">
          <ul className="th-ribbon">
            {RIBBON_ITEMS.map((item, i) => {
              const p = i / n;
              const staticOpacity = p < EDGE_FADE ? p / EDGE_FADE : p > 1 - EDGE_FADE ? (1 - p) / EDGE_FADE : 1;
              const style = {
                "--th-a0": `${(-ARC_DEG + 2 * ARC_DEG * p).toFixed(2)}deg`,
                "--th-o0": staticOpacity.toFixed(2),
                animationDelay: `${(-LAP_S * p).toFixed(2)}s`,
              } as CSSProperties;
              return (
                <li key={i} className="th-card" style={style}>
                  <RibbonCard item={item} />
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* T.H.E.O. Never transformed or animated beyond opacity. */}
      <div className="th-theo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="th-theo-still"
          data-hidden={videoOn ? "true" : "false"}
          src={still.src}
          srcSet={`${still.srcSmall} 480w, ${still.src} ${still.width}w`}
          sizes="(max-width: 767px) 108vw, 66vh"
          width={still.width}
          height={still.height}
          alt={media.label}
          fetchPriority="high"
        />
        <video
          ref={videoRef}
          className="th-theo-video"
          data-visible={videoOn ? "true" : "false"}
          muted
          playsInline
          preload="none"
          aria-hidden="true"
          disablePictureInPicture
          disableRemotePlayback
        />
      </div>

      <div className="th-scrim" aria-hidden="true" />

      <div className="th-copy">
        <div className="th-copy-top">
          <h1 id="th-headline" className="th-headline">
            {THEO_HERO_COPY.headlineLead} <em>{THEO_HERO_COPY.headlineAccent}</em>
          </h1>
          <p className="th-sub">{THEO_HERO_COPY.subhead}</p>
        </div>
        <div className="th-cta-row">
          <Link href={THEO_HERO_COPY.primaryCta.href} className="th-cta">
            {THEO_HERO_COPY.primaryCta.label} <span aria-hidden="true">&rarr;</span>
          </Link>
          <a
            href={THEO_HERO_COPY.secondaryCta.href}
            className="th-cta-secondary"
            onClick={(e) => {
              const id = THEO_HERO_COPY.secondaryCta.href.replace(/^#/, "");
              const target = document.getElementById(id);
              if (!target) return; // plain hash jump
              e.preventDefault();
              target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
              history.replaceState(null, "", THEO_HERO_COPY.secondaryCta.href);
            }}
          >
            {THEO_HERO_COPY.secondaryCta.label}
          </a>
        </div>
      </div>
    </section>
  );
}
