"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The Meet T.H.E.O plate. Two stacked clips: the 15s intro (he looks up from his
 * tablet, closes it, and greets you in Finley's voice) plays once, then crossfades
 * to a seamless idle loop seeded from the intro's final frame — so there's no jump.
 *
 * Audio: browsers only allow sound-on autoplay with prior user activation. Users
 * reach this page by clicking through the app (SPA nav), so it usually plays with
 * sound; if the browser blocks it we fall back to muted and offer an unmute.
 * prefers-reduced-motion leaves it paused on the poster.
 */
/**
 * mode:
 * - "card": 3:4 plate (original studio-panel use)
 * - "fill": fills the parent (variant-C full-bleed panel)
 * - "lobby": fills the parent AND feathers the clip's edges away so T.H.E.O's
 *   baked-in backdrop dissolves into the page's own library scene — the
 *   game-lobby composite. Horizontal feather lives on the wrapper, vertical on
 *   each video, so the two masks intersect without mask-composite support.
 */
export default function TheoIntroVideo({
  mode = "card",
  greetDelayMs = 3500,
}: { mode?: "card" | "fill" | "lobby"; greetDelayMs?: number } = {}) {
  const fill = mode === "fill" || mode === "lobby";
  const lobby = mode === "lobby";
  const lobbyWrapMask = "linear-gradient(to right, transparent 0%, #000 13%, #000 74%, transparent 100%)";
  const lobbyVideoMask = "linear-gradient(to bottom, transparent 0%, #000 9%, #000 58%, rgba(0,0,0,0.55) 84%, transparent 99%)";
  const introRef = useRef<HTMLVideoElement>(null);
  const idleRef = useRef<HTMLVideoElement>(null);
  // He idles on arrival, greets after a settle beat, then idles again:
  // "waiting" (idle loop, greet pending) -> "greeting" (intro) -> "done" (idle).
  const [phase, setPhase] = useState<"waiting" | "greeting" | "done">("waiting");
  const introVisible = phase === "greeting";
  const [showUnmute, setShowUnmute] = useState(false);
  // Lobby: true while the browser is playing the baked-background mp4 fallback
  // (Safari — no VP9 alpha). The edge-feather masks only apply then; the alpha
  // cutout needs no feathering and the bottom fade would ghost the figure.
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    if (!lobby) return;
    const v = introRef.current;
    if (!v) return;
    const check = () => { if (v.currentSrc) setUsingFallback(v.currentSrc.endsWith(".mp4")); };
    check();
    v.addEventListener("loadedmetadata", check);
    return () => v.removeEventListener("loadedmetadata", check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby]);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return; // hold on the poster
    const intro = introRef.current;
    const idle = idleRef.current;
    if (!intro || !idle) return;

    // Arrive on the idle: he's standing there breathing while the page settles.
    idle.play().catch(() => {});

    // Greet only after BOTH the settle beat has passed AND the intro is
    // buffered enough to play through — so he never talks over a loading page.
    let delayDone = false;
    let cancelled = false;
    const tryGreet = () => {
      if (cancelled || !delayDone || intro.readyState < 3) return;
      setPhase("greeting");
      intro.muted = false;
      intro.play().catch(() => {
        // Sound blocked (no activation / low media engagement): play muted, offer unmute.
        intro.muted = true;
        setShowUnmute(true);
        intro.play().catch(() => {});
      });
    };
    const timer = window.setTimeout(() => { delayDone = true; tryGreet(); }, greetDelayMs);
    intro.addEventListener("canplaythrough", tryGreet);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      intro.removeEventListener("canplaythrough", tryGreet);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEnded() {
    setPhase("done");
    setShowUnmute(false);
    const idle = idleRef.current;
    if (idle) {
      idle.currentTime = 0;
      idle.play().catch(() => {});
    }
  }

  function unmute() {
    const v = introRef.current;
    if (!v) return;
    v.muted = false;
    setShowUnmute(false);
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        ...(fill ? { height: "100%" } : { aspectRatio: "3 / 4" }),
        // Lobby composites over the page's own scene — no opaque plate, and the
        // horizontal half of the edge feather rides the wrapper.
        background: lobby ? "transparent" : "var(--ds-paper, #F4F1E8)",
        ...(lobby && usingFallback ? { maskImage: lobbyWrapMask, WebkitMaskImage: lobbyWrapMask } : {}),
      }}
    >
      {/* Idle loop underneath — revealed when the intro ends */}
      <video
        ref={idleRef}
        // Lobby serves the alpha-channel cutout (VP9 webm); the baked-background
        // mp4 rides behind it as the Safari fallback, which the edge feathering
        // keeps presentable. Non-lobby modes keep the plain mp4.
        {...(lobby ? {} : { src: "/theo-idle.mp4" })}
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: lobby ? "52% 8%" : fill ? "50% 28%" : "center",
          ...(lobby && usingFallback ? { maskImage: lobbyVideoMask, WebkitMaskImage: lobbyVideoMask } : {}),
          opacity: introVisible ? 0 : 1,
          transition: "opacity 400ms ease",
        }}
      >
        {lobby && <source src="/theo-idle-alpha.webm" type='video/webm; codecs="vp9"' />}
        {lobby && <source src="/theo-idle.mp4" type="video/mp4" />}
      </video>
      {/* Intro on top, plays once */}
      <video
        ref={introRef}
        {...(lobby ? {} : { src: "/theo-intro.mp4" })}
        poster={lobby ? "/theo-poster-alpha.png" : "/theo-poster.jpg"}
        playsInline
        preload="auto"
        onEnded={handleEnded}
        aria-label="T.H.E.O introduces himself"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: lobby ? "52% 8%" : fill ? "50% 28%" : "center",
          ...(lobby && usingFallback ? { maskImage: lobbyVideoMask, WebkitMaskImage: lobbyVideoMask } : {}),
          opacity: introVisible ? 1 : 0,
          transition: "opacity 400ms ease",
        }}
      >
        {lobby && <source src="/theo-intro-alpha.webm" type='video/webm; codecs="vp9"' />}
        {lobby && <source src="/theo-intro.mp4" type="video/mp4" />}
      </video>
      {showUnmute && introVisible && (
        <button
          onClick={unmute}
          aria-label="Hear T.H.E.O"
          style={{
            position: "absolute",
            right: 16,
            ...(fill ? { top: 16 } : { bottom: 16 }),
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            background: "var(--ds-paper, #F4F1E8)",
            color: "var(--ds-accent-500, #A05526)",
            boxShadow: "0 0 0 1px rgba(193,122,71,0.45), 0 2px 12px rgba(0,0,0,0.25)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </svg>
        </button>
      )}
    </div>
  );
}
