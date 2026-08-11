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
export default function TheoIntroVideo({ mode = "card" }: { mode?: "card" | "fill" | "lobby" } = {}) {
  const fill = mode === "fill" || mode === "lobby";
  const lobby = mode === "lobby";
  const lobbyWrapMask = "linear-gradient(to right, transparent 0%, #000 13%, #000 74%, transparent 100%)";
  const lobbyVideoMask = "linear-gradient(to bottom, transparent 0%, #000 9%, #000 58%, rgba(0,0,0,0.55) 84%, transparent 99%)";
  const introRef = useRef<HTMLVideoElement>(null);
  const idleRef = useRef<HTMLVideoElement>(null);
  const [introDone, setIntroDone] = useState(false);
  const [showUnmute, setShowUnmute] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return; // hold on the poster
    const v = introRef.current;
    if (!v) return;
    v.muted = false;
    v.play()
      .catch(() => {
        // Sound blocked (no activation / low media engagement): play muted, offer unmute.
        v.muted = true;
        setShowUnmute(true);
        return v.play().catch(() => {});
      });
  }, []);

  function handleEnded() {
    setIntroDone(true);
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
        ...(lobby ? { maskImage: lobbyWrapMask, WebkitMaskImage: lobbyWrapMask } : {}),
      }}
    >
      {/* Idle loop underneath — revealed when the intro ends */}
      <video
        ref={idleRef}
        src="/theo-idle.mp4"
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
          ...(lobby ? { maskImage: lobbyVideoMask, WebkitMaskImage: lobbyVideoMask } : {}),
          opacity: introDone ? 1 : 0,
          transition: "opacity 400ms ease",
        }}
      />
      {/* Intro on top, plays once */}
      <video
        ref={introRef}
        src="/theo-intro.mp4"
        poster="/theo-poster.jpg"
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
          ...(lobby ? { maskImage: lobbyVideoMask, WebkitMaskImage: lobbyVideoMask } : {}),
          opacity: introDone ? 0 : 1,
          transition: "opacity 400ms ease",
        }}
      />
      {showUnmute && !introDone && (
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
