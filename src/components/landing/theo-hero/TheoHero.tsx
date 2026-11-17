"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  RIBBON_ITEMS,
  THEO_ENTRANCES,
  THEO_HERO_COPY,
  THEO_HERO_MEDIA,
  type RibbonItem,
  type TheoEntranceVariant,
  type TheoHeroMedia,
} from "./theo-hero-config";
import { THEO_ENTRANCE_CSS, THEO_HERO_CSS } from "./theo-hero-styles";

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
 *
 * ENTRANCE VARIANTS (`variant`, /hero-preview?v=walk|door|chair): a full-frame
 * clip of him walking in plays first, in a 16:9 box (.th-ent-back) under the
 * ribbon; the idle cutout sits in a second box with the same geometry
 * (.th-ent-front) above it, at the exact rect the clip's last frame was made
 * for. Here the timeline follows the clip's own clock (data-phase), because
 * the clip can start late on a slow connection. If the clip can't play, the
 * hero drops back to the plain version above.
 */

// Lead time between the video actually playing and revealing it, so the
// dissolve is between two moving images, never into a frozen first frame.
const PREROLL_MS = 260;
// Ribbon: one lap along the visible arc. Must match --th-lap in theo-hero-styles.ts.
const LAP_S = 72;
const ARC_DEG = 100; // the arc runs -ARC_DEG..+ARC_DEG, fading at both ends
const EDGE_FADE = 0.14; // fraction of the lap spent fading in / out
const PHONE_MQ = "(max-width: 767px)";

// Entrance variants.
const HANDOFF_FADE_MS = 220; // must match the .th-ent-rect transition in theo-hero-styles.ts
// The idle loop's head starts moving ~0.1s in (SSIM vs frame 0: 0.998 at 66ms,
// 0.88 at 200ms, 0.85 at 366ms), and every clip ends on its frame 0. So the
// entrance cannot use the 260ms pre-roll: start the idle just before the
// handoff and reveal it once it has PRESENTED two frames (proof it is moving,
// so still never a dissolve into a frozen frame), ~0.05s into the loop.
const IDLE_LEAD_S = 0.05;
const IDLE_LIVE_FALLBACK_MS = 120; // no requestVideoFrameCallback (or none fired): trust "playing" this long
const IDLE_WAIT_MS = 1500; // at the handoff point with no proven idle yet: hand off to the still
const START_TIMEOUT_MS = 8000; // clip never started: plain hero
const STALL_TIMEOUT_MS = 6000; // clip froze mid-walk: plain hero
const NARROW_ASPECT = 0.772; // below this the box is sized by width (see --th-bw)
const FALLBACK_CLIP_S = 5.04;

type Phase = "intro" | "handoff" | "settled";

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

/** Off-screen pause/resume only touches videos that are meant to be playing. */
function resumeIfArmed(v: HTMLVideoElement | null) {
  if (v && v.dataset.armed === "true" && v.getAttribute("src") && !v.ended) v.play().catch(() => {});
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

export default function TheoHero({
  media = THEO_HERO_MEDIA,
  variant,
}: { media?: TheoHeroMedia; variant?: TheoEntranceVariant } = {}) {
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const entRef = useRef<HTMLVideoElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [videoOn, setVideoOn] = useState(false);
  const videoOnRef = useRef(false);
  // Entrance variant in play. Dropped to null (the plain hero) if the clip can't play.
  const [entrance, setEntrance] = useState<TheoEntranceVariant | null>(variant ?? null);
  const [phase, setPhase] = useState<Phase>("intro");

  // Plain hero: still first, video after the page has loaded and gone idle.
  useEffect(() => {
    if (entrance) return;
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
    // Not once: if the hero scrolls away inside the pre-roll, the reveal is
    // skipped and the next "playing" (on scroll back) gets another chance.
    let revealed = false;
    const onPlaying = () => {
      if (revealed) return;
      window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(() => {
        if (cancelled || revealed || v.paused || !alphaComposites(v)) return;
        revealed = true;
        videoOnRef.current = true;
        setVideoOn(true);
      }, PREROLL_MS);
    };
    const onError = () => giveUp();

    const start = () => {
      if (cancelled) return;
      const src = pickSource(media, window.matchMedia(PHONE_MQ).matches);
      if (!src) return; // Apple WebKit without an HEVC-alpha file: hold the still
      v.loop = media.loop;
      v.addEventListener("loadeddata", onLoadedData);
      v.addEventListener("playing", onPlaying);
      v.addEventListener("error", onError);
      v.src = src;
      v.dataset.armed = "true";
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
  }, [media, entrance]);

  // Entrance: poster first, clip after load, idle started just before the
  // handoff (invisible), handoff on the clip's own clock.
  useEffect(() => {
    if (!entrance) return;
    const ent = entRef.current;
    const idle = videoRef.current;
    const root = rootRef.current;
    if (!ent || !idle || !root) return;
    // Reduced motion: the CSS already paints the finished composition; no clip is loaded.
    if (prefersReducedMotion()) return;
    const cfg = THEO_ENTRANCES[entrance];
    let cancelled = false;
    let started = false;
    let raf = 0;
    let handedOff = false;
    let idleStarted = false;
    let waitStart = 0;
    let loadTimer = 0;
    let startTimer = 0;
    let stallTimer = 0;
    let settleTimer = 0;
    let revealTimer = 0;
    // Full-res cut even on phones: the 480w one goes visibly soft next to the 1080p clip.
    let idleSrc = pickSource(media, false);

    const stopVideo = (v: HTMLVideoElement) => {
      v.dataset.armed = "false";
      v.pause();
      v.removeAttribute("src");
      v.load();
    };

    // Anything goes wrong before the handoff: today's hero, from the top.
    const dropToPlainHero = () => {
      if (cancelled || handedOff) return;
      cancelled = true;
      stopVideo(ent);
      stopVideo(idle);
      videoOnRef.current = false;
      setVideoOn(false);
      setEntrance(null);
    };

    const idleFail = () => {
      idleSrc = null;
      stopVideo(idle);
    };
    const onIdleLoaded = () => {
      if (!alphaComposites(idle)) idleFail();
    };
    // The idle counts as live once it has presented two frames. Before the
    // handoff the rect is invisible, so this only arms it; after the handoff
    // (a late idle) it fades in over the still.
    const markIdleLive = () => {
      if (cancelled || videoOnRef.current || idle.paused || !alphaComposites(idle)) return;
      videoOnRef.current = true;
      setVideoOn(true);
    };
    const onIdlePlaying = () => {
      if (videoOnRef.current) return;
      window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(markIdleLive, IDLE_LIVE_FALLBACK_MS);
      if (typeof idle.requestVideoFrameCallback === "function") {
        idle.requestVideoFrameCallback(() => idle.requestVideoFrameCallback(markIdleLive));
      }
    };

    const handoff = () => {
      if (handedOff) return;
      handedOff = true;
      window.clearTimeout(stallTimer);
      cancelAnimationFrame(raf);
      setPhase("handoff");
      settleTimer = window.setTimeout(() => setPhase("settled"), HANDOFF_FADE_MS);
    };

    const handoffPoint = () =>
      cfg.handoffAt ?? (Number.isFinite(ent.duration) && ent.duration > 0 ? ent.duration : FALLBACK_CLIP_S);

    const tick = () => {
      if (cancelled || handedOff) return;
      raf = requestAnimationFrame(tick);
      const t = ent.currentTime;
      const at = handoffPoint();
      if (!idleStarted && idleSrc && t >= at - IDLE_LEAD_S) {
        idleStarted = true;
        idle.dataset.armed = "true";
        if (root.dataset.paused !== "true") idle.play().catch(() => {});
      }
      if (t >= at - 0.02 || ent.ended) {
        if (!waitStart) waitStart = performance.now();
        // Normal case: the idle is presenting frames and proved its alpha. Otherwise
        // (Safari, slow idle) the still takes the handoff; it is the same frame.
        if (videoOnRef.current || !idleSrc || performance.now() - waitStart > IDLE_WAIT_MS) handoff();
      }
    };

    const armStall = () => {
      window.clearTimeout(stallTimer);
      if (!handedOff && !ent.paused) stallTimer = window.setTimeout(dropToPlainHero, STALL_TIMEOUT_MS);
    };
    const onEntPlaying = () => {
      window.clearTimeout(startTimer);
      // Start buffering the idle now so it is ready to pre-roll ~0.4s before the handoff.
      if (idleSrc && !idle.getAttribute("src")) {
        idle.loop = media.loop;
        idle.preload = "auto";
        idle.src = idleSrc;
      }
      if (!raf) raf = requestAnimationFrame(tick);
      armStall();
    };
    const onEntPause = () => window.clearTimeout(stallTimer);
    const onEntError = () => dropToPlainHero();

    const startEntrance = () => {
      if (cancelled || started) return;
      started = true;
      window.clearTimeout(loadTimer);
      ent.muted = true;
      ent.defaultMuted = true;
      ent.addEventListener("playing", onEntPlaying);
      ent.addEventListener("timeupdate", armStall);
      ent.addEventListener("pause", onEntPause);
      ent.addEventListener("error", onEntError);
      // Narrow screens only see the middle of the frame: skip the empty lead-in there.
      if (cfg.narrowStartAt > 0 && window.innerWidth / window.innerHeight < NARROW_ASPECT) {
        ent.addEventListener(
          "loadedmetadata",
          () => {
            ent.currentTime = cfg.narrowStartAt;
          },
          { once: true },
        );
      }
      ent.preload = "auto";
      ent.src = cfg.video;
      ent.dataset.armed = "true";
      if (root.dataset.paused !== "true") {
        startTimer = window.setTimeout(dropToPlainHero, START_TIMEOUT_MS);
        ent.play().catch((err: unknown) => {
          // Autoplay refused (or any non-abort failure): no entrance.
          if (!(err instanceof DOMException && err.name === "AbortError")) dropToPlainHero();
        });
      }
    };

    if (saveDataOrSlow()) {
      dropToPlainHero();
      return;
    }
    idle.addEventListener("loadeddata", onIdleLoaded);
    idle.addEventListener("playing", onIdlePlaying);
    idle.addEventListener("error", idleFail);
    // Poster first; the clip after the page has loaded (or 3s, whichever is first).
    if (document.readyState === "complete") startEntrance();
    else {
      window.addEventListener("load", startEntrance, { once: true });
      loadTimer = window.setTimeout(startEntrance, 3000);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      [loadTimer, startTimer, stallTimer, settleTimer, revealTimer].forEach((id) => window.clearTimeout(id));
      window.removeEventListener("load", startEntrance);
      ent.removeEventListener("playing", onEntPlaying);
      ent.removeEventListener("timeupdate", armStall);
      ent.removeEventListener("pause", onEntPause);
      ent.removeEventListener("error", onEntError);
      idle.removeEventListener("loadeddata", onIdleLoaded);
      idle.removeEventListener("playing", onIdlePlaying);
      idle.removeEventListener("error", idleFail);
    };
  }, [media, entrance]);

  // Off-screen: stop video decode and the ribbon's animations.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          root.dataset.paused = "false";
          if (!prefersReducedMotion()) {
            resumeIfArmed(videoRef.current);
            resumeIfArmed(entRef.current);
          }
        } else {
          root.dataset.paused = "true";
          videoRef.current?.pause();
          entRef.current?.pause();
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
  const ent = entrance ? THEO_ENTRANCES[entrance] : null;

  const theoMedia = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="th-theo-still"
        data-hidden={videoOn ? "true" : "false"}
        src={still.src}
        srcSet={`${still.srcSmall} 480w, ${still.src} ${still.width}w`}
        sizes={ent ? "(max-width: 767px) 88vw, 42vw" : "(max-width: 767px) 108vw, 66vh"}
        width={still.width}
        height={still.height}
        alt={media.label}
        fetchPriority={ent ? "low" : "high"}
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
    </>
  );

  return (
    <section
      ref={rootRef}
      className="th-hero"
      aria-labelledby="th-headline"
      data-paused="false"
      data-variant={entrance ?? undefined}
      data-phase={entrance ? phase : undefined}
    >
      {/* First child, so every layer below is styled at first paint. */}
      <style>{entrance ? THEO_HERO_CSS + THEO_ENTRANCE_CSS : THEO_HERO_CSS}</style>
      <div className="th-stage" aria-hidden="true">
        <div className="th-stage-glow" />
      </div>

      {/* Entrance: the clip (poster first) over the room plate, in the 16:9 box;
          the dimmed room on top fades in once he has arrived. */}
      {ent && (
        <div className="th-ent-box th-ent-back" aria-hidden="true">
          {ent.plate && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="th-ent-plate" src={ent.plate} alt="" width={1920} height={1080} decoding="async" fetchPriority="low" />
          )}
          <video
            ref={entRef}
            className="th-ent-video"
            poster={ent.poster}
            muted
            playsInline
            preload="none"
            disablePictureInPicture
            disableRemotePlayback
          />
          {ent.plateDim && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="th-ent-plate th-ent-plate--dim" src={ent.plateDim} alt="" width={1920} height={1080} decoding="async" fetchPriority="low" />
          )}
        </div>
      )}

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
      {ent ? (
        <div className="th-ent-box th-ent-front">
          <div className="th-ent-rect">{theoMedia}</div>
        </div>
      ) : (
        <div className="th-theo">{theoMedia}</div>
      )}

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
