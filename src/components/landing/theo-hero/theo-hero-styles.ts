// T.H.E.O hero styles, inlined as a <style> element (the landing page inlines
// its own CSS the same way) so the hero adds no render-blocking stylesheet
// request on mobile. Own th- namespace: the live hero's .lv2-hero* rules carry
// !important phone overrides in globals.css.
// Palette and faces are the landing page's own: #120D08..#2C2419 stage,
// #C17A47 / #D98B58 accent, #E6C18B gold, #F9F7F2 ink, Playfair + Lora + Manrope.
export const THEO_HERO_CSS = `
.th-hero {
  /* Geometry. Desktop: ring seen from inside, centre cards behind his head,
     side cards wrap toward the viewer. */
  --th-lap: 72s;              /* must match LAP_S in TheoHero.tsx */
  --th-r: 760px;              /* ring radius */
  --th-tilt: -10deg;          /* centre rides higher than the sides: an arch over his shoulders */
  --th-scale: 1;              /* card typography scale */
  --th-cw: 164px;
  --th-ch: 238px;
  --th-ring-y: 40%;           /* ring centre line; arch peak lands behind his head */
  --th-theo-h: 86vh;
  --th-theo-h: 86svh;
  --th-theo-w: calc(var(--th-theo-h) * 816 / 1104);

  position: relative;
  isolation: isolate;
  height: 100vh;
  height: 100svh;
  min-height: 620px;
  overflow: hidden;
  background: #120D08;
  color: #F9F7F2;
}

/* ── stage ── */
.th-stage {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(120% 90% at 50% 30%, #1E1610 0%, #120D08 55%, #0B0805 100%);
}
.th-stage-glow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 34% 46% at 50% 36%, rgba(217, 139, 88, 0.24), rgba(193, 122, 71, 0.07) 55%, transparent 75%),
    radial-gradient(ellipse 50% 16% at 50% 100%, rgba(193, 122, 71, 0.10), transparent 70%);
  animation: th-fade 2.2s ease-out both;
}

/* ── ribbon ──
   view   : perspective root. Fade + edge mask live HERE (flattening is fine).
   sweep  : preserve-3d; rotates the whole ring in once.
   ring   : preserve-3d.
   card   : orbits along -100deg..+100deg, fading at both ends. */
.th-ribbon-view {
  position: absolute;
  inset: 0;
  z-index: 1;
  perspective: 1000px;
  perspective-origin: 50% var(--th-ring-y);
  -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 9%, #000 91%, transparent 100%);
  mask-image: linear-gradient(to right, transparent 0%, #000 9%, #000 91%, transparent 100%);
  animation: th-fade 1.4s ease-out 1.8s both;
  pointer-events: none;
}
.th-ribbon-sweep {
  position: absolute;
  left: 50%;
  top: var(--th-ring-y);
  width: 0;
  height: 0;
  transform-style: preserve-3d;
  transform: rotateX(var(--th-tilt)) rotateY(0deg);
  animation: th-sweep 2.6s cubic-bezier(0.16, 1, 0.3, 1) 1.6s both;
}
.th-ribbon {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  transform-style: preserve-3d;
}
.th-card {
  position: absolute;
  left: calc(var(--th-cw) / -2);
  top: calc(var(--th-ch) / -2);
  width: var(--th-cw);
  height: var(--th-ch);
  /* Static pose (reduced motion, and the first frame before the animation applies). */
  transform: rotateY(var(--th-a0)) translateZ(calc(var(--th-r) * -1));
  opacity: var(--th-o0);
  animation: th-orbit var(--th-lap) linear infinite;
  backface-visibility: hidden;
}
.th-hero[data-paused="true"] .th-card,
.th-hero[data-paused="true"] .th-ribbon-sweep {
  animation-play-state: paused;
}

/* covers */
.th-cover {
  position: relative;
  height: 100%;
  box-sizing: border-box;
  padding: calc(26px * var(--th-scale)) calc(16px * var(--th-scale));
  border-radius: 2px 9px 9px 2px;
  overflow: hidden;
  box-shadow:
    0 18px 40px -12px rgba(0, 0, 0, 0.75),
    inset 4px 0 0 rgba(0, 0, 0, 0.3),
    inset 5px 0 0 rgba(255, 235, 200, 0.06);
}
.th-cover-hair {
  position: absolute;
  left: calc(12px * var(--th-scale));
  right: calc(12px * var(--th-scale));
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(193, 122, 71, 0.45), transparent);
}
.th-cover-hair--top { top: calc(12px * var(--th-scale)); }
.th-cover-hair--bottom { bottom: calc(12px * var(--th-scale)); }
.th-cover-kicker {
  font-family: var(--font-manrope), sans-serif;
  font-size: max(6px, calc(9px * var(--th-scale)));
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(230, 193, 139, 0.78);
  margin-bottom: calc(10px * var(--th-scale));
}
.th-cover-title {
  font-family: var(--font-playfair), "Playfair Display", serif;
  font-style: italic;
  font-weight: 500;
  font-size: calc(19px * var(--th-scale));
  line-height: 1.18;
  color: #F4E8D1;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  text-wrap: balance;
}
.th-cover-seal {
  position: absolute;
  right: calc(14px * var(--th-scale));
  bottom: calc(20px * var(--th-scale));
  font-size: calc(13px * var(--th-scale));
  color: #E3C27E;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
}

/* chapter pages */
.th-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  padding: calc(22px * var(--th-scale)) calc(18px * var(--th-scale));
  border-radius: 2px 6px 6px 2px;
  background: linear-gradient(170deg, #FAF8F3 0%, #EFE8DA 100%);
  box-shadow: 0 18px 40px -12px rgba(0, 0, 0, 0.7);
  color: #4A3D2C;
}
.th-page-chapter {
  font-family: var(--font-playfair), "Playfair Display", serif;
  font-style: italic;
  font-size: calc(15px * var(--th-scale));
  color: #7A4E2E;
}
.th-page-rule {
  width: calc(22px * var(--th-scale));
  height: 1px;
  margin: calc(10px * var(--th-scale)) 0 calc(12px * var(--th-scale));
  background: #C17A47;
  opacity: 0.6;
}
.th-page-first {
  margin: 0 0 calc(10px * var(--th-scale));
  font-family: var(--font-lora), serif;
  font-style: italic;
  font-size: max(6px, calc(11px * var(--th-scale)));
  line-height: 1.6;
}
.th-page-lines {
  flex: 1;
  background: repeating-linear-gradient(to bottom, rgba(74, 61, 44, 0.16) 0 2px, transparent 2px calc(11px * var(--th-scale)));
  -webkit-mask-image: linear-gradient(to bottom, #000 65%, transparent);
  mask-image: linear-gradient(to bottom, #000 65%, transparent);
}

/* ── T.H.E.O ── bottom-anchored (the cutout is cropped at the waist), never
   moved or scaled; only the wrapper fades in. */
.th-theo {
  position: absolute;
  z-index: 2;
  bottom: 0;
  left: calc(50% - var(--th-theo-w) / 2);
  width: var(--th-theo-w);
  height: var(--th-theo-h);
  pointer-events: none; /* lets the phone row swipe straight through him */
  /* Emerges from the dark: painted dim on the very first frame, then lit.
     Starting at opacity 0 would hold back LCP (he is the LCP element) until
     the fade begins; a dim start reads the same on a black stage. */
  animation: th-emerge 1.1s ease-out both;
}
.th-theo-still,
.th-theo-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: 50% 100%;
}
.th-theo-still {
  /* The video fades in ON TOP first; the still leaves only after it is fully
     covered, so there is never a half-and-half ghost. */
  transition: opacity 320ms linear 480ms;
}
.th-theo-still[data-hidden="true"] { opacity: 0; }
.th-theo-video {
  opacity: 0;
  transition: opacity 450ms linear;
}
.th-theo-video[data-visible="true"] { opacity: 1; }
.th-theo-video::-webkit-media-controls,
.th-theo-video::-webkit-media-controls-start-playback-button { display: none !important; }

/* Bottom scrim: his lower body sinks into the stage so the copy reads. */
.th-scrim {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent 48%, rgba(18, 13, 8, 0.5) 66%, rgba(18, 13, 8, 0.9) 86%, #1A140E 100%);
}

/* ── copy ── */
.th-copy {
  position: absolute;
  z-index: 4;
  left: 0;
  right: 0;
  bottom: 6vh;
  bottom: 6svh;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  pointer-events: none;
}
.th-copy a { pointer-events: auto; }
.th-headline {
  margin: 0;
  font-family: var(--font-playfair), "Playfair Display", serif;
  font-weight: 400;
  font-size: clamp(44px, 5.4vw, 88px);
  line-height: 1.02;
  letter-spacing: -0.01em;
  color: #F9F7F2;
  text-shadow: 0 2px 28px rgba(0, 0, 0, 0.6);
  text-wrap: balance;
  animation: th-rise 1s ease-out 2.9s both;
}
.th-headline em {
  font-style: italic;
  color: #D98B58;
}
.th-sub {
  max-width: 860px;
  margin: 14px auto 0;
  font-family: var(--font-lora), serif;
  font-size: 18px;
  line-height: 1.55;
  color: rgba(249, 247, 242, 0.8);
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.7);
  text-wrap: balance;
  animation: th-rise 1s ease-out 3.25s both;
}
.th-cta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 14px 28px;
  margin-top: 26px;
  animation: th-rise 0.9s ease-out 3.6s both;
}
.th-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 34px;
  border-radius: 20px;
  background: #C17A47;
  color: #1A140E;
  font-family: var(--font-manrope), sans-serif;
  font-size: 16px;
  font-weight: 800;
  text-decoration: none;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.35);
  transition: background-color 0.2s ease;
}
.th-cta:hover { background: #D98B58; }
.th-cta-secondary {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-family: var(--font-manrope), sans-serif;
  font-size: 15px;
  font-weight: 600;
  color: #E6C18B;
  text-decoration: underline;
  text-decoration-color: rgba(230, 193, 139, 0.35);
  text-underline-offset: 5px;
  transition: text-decoration-color 0.2s ease;
}
.th-cta-secondary:hover { text-decoration-color: #E6C18B; }
.th-cta:focus-visible,
.th-cta-secondary:focus-visible {
  outline: 2px solid #E6C18B;
  outline-offset: 3px;
}

/* ── phone: flat swipeable row behind his head, no 3D, headline up top ── */
@media (max-width: 767px) {
  .th-hero {
    --th-scale: 0.56;
    --th-cw: 92px;
    --th-ch: 133px;
    --th-theo-h: 66vh;
    --th-theo-h: 66svh;
    --th-row-top: 39vh;
    --th-row-top: 39svh;
    min-height: 600px;
  }
  .th-stage-glow {
    background:
      radial-gradient(ellipse 70% 40% at 50% 50%, rgba(217, 139, 88, 0.22), rgba(193, 122, 71, 0.06) 55%, transparent 78%);
  }
  .th-ribbon-view {
    inset: auto 0 auto 0;
    top: var(--th-row-top);
    perspective: none;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    -webkit-mask-image: linear-gradient(to right, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%);
    mask-image: linear-gradient(to right, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%);
    pointer-events: auto;
    touch-action: pan-x;
  }
  .th-ribbon-view::-webkit-scrollbar { display: none; }
  .th-ribbon-sweep {
    position: static;
    width: auto;
    height: auto;
    transform: none;
    transform-style: flat;
    animation: none;
  }
  .th-ribbon {
    position: static;
    display: flex;
    gap: 12px;
    width: max-content;
    padding: 4px 24px 18px;
    transform-style: flat;
  }
  .th-card {
    position: relative;
    left: auto;
    top: auto;
    flex: none;
    transform: none;
    opacity: 1;
    animation: none;
    scroll-snap-align: center;
  }
  .th-scrim {
    background: linear-gradient(to bottom, transparent 62%, rgba(18, 13, 8, 0.55) 76%, rgba(18, 13, 8, 0.92) 90%, #1A140E 100%);
  }
  .th-copy {
    top: 92px;
    bottom: max(24px, env(safe-area-inset-bottom));
    padding: 0 20px;
    justify-content: space-between;
  }
  .th-headline { font-size: 40px; }
  .th-sub { margin-top: 10px; font-size: 15px; max-width: 34ch; }
  .th-cta-row { margin-top: 0; gap: 4px 22px; }
}

/* Reduced motion: the finished composition, no drift, no fades. */
@media (prefers-reduced-motion: reduce) {
  .th-hero *,
  .th-hero *::before,
  .th-hero *::after {
    animation: none !important;
  }
  .th-theo-still,
  .th-theo-video { transition: none; }
}

@keyframes th-emerge {
  from { opacity: 0.14; }
  to { opacity: 1; }
}
@keyframes th-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes th-rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}
@keyframes th-sweep {
  from { transform: rotateX(var(--th-tilt)) rotateY(34deg); }
  to { transform: rotateX(var(--th-tilt)) rotateY(0deg); }
}
@keyframes th-orbit {
  0% { transform: rotateY(-100deg) translateZ(calc(var(--th-r) * -1)); opacity: 0; }
  14% { opacity: 1; }
  86% { opacity: 1; }
  100% { transform: rotateY(100deg) translateZ(calc(var(--th-r) * -1)); opacity: 0; }
}
`;
