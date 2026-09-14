"use client";

// A stone hearth with live flames, parked at the bottom-right of the room on wide
// screens. Narrow screens keep only its firelight on the wall (the glow layer is
// rendered by the shelf; this file owns the hearth itself).

export default function Fireplace() {
  return (
    <div className="bs-fireplace" aria-hidden="true">
      <style>{CSS}</style>
      <svg viewBox="0 0 360 320" className="bs-fireplace-svg">
        <defs>
          <linearGradient id="fp-stone" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#6E5A48" />
            <stop offset="1" stopColor="#4A3A2C" />
          </linearGradient>
          <linearGradient id="fp-mantel" x1="0" x2="1">
            <stop offset="0" stopColor="#8E5D31" />
            <stop offset="0.5" stopColor="#A9743F" />
            <stop offset="1" stopColor="#74471F" />
          </linearGradient>
          <radialGradient id="fp-firebox" cx="0.5" cy="0.9" r="0.8">
            <stop offset="0" stopColor="#3A1A08" />
            <stop offset="1" stopColor="#0B0603" />
          </radialGradient>
          <radialGradient id="fp-flame" cx="0.5" cy="0.85" r="0.7">
            <stop offset="0" stopColor="#FFF3C0" />
            <stop offset="0.35" stopColor="#FFC24A" />
            <stop offset="0.7" stopColor="#F26A2A" stopOpacity="0.9" />
            <stop offset="1" stopColor="#B4321C" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="fp-ember" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FFB347" />
            <stop offset="1" stopColor="#B4321C" stopOpacity="0" />
          </radialGradient>
          <filter id="fp-blur"><feGaussianBlur stdDeviation="2.2" /></filter>
        </defs>

        {/* firelight cast on the floor */}
        <ellipse cx="180" cy="312" rx="190" ry="26" fill="url(#fp-ember)" opacity="0.55" className="fp-floorglow" />

        {/* stone surround */}
        <rect x="30" y="60" width="300" height="250" rx="6" fill="url(#fp-stone)" />
        {STONES.map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="4" fill={i % 3 === 0 ? "#7A6552" : i % 3 === 1 ? "#66533F" : "#5B4838"} stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
        ))}

        {/* mantel shelf */}
        <rect x="14" y="44" width="332" height="22" rx="3" fill="url(#fp-mantel)" />
        <rect x="20" y="66" width="320" height="6" fill="#4E2E14" />
        <rect x="14" y="44" width="332" height="4" fill="rgba(255,225,180,0.35)" />

        {/* firebox */}
        <path d="M84 300 V150 a96 96 0 0 1 192 0 V300 Z" fill="url(#fp-firebox)" />
        <path d="M84 300 V150 a96 96 0 0 1 192 0 V300" fill="none" stroke="#2A1A0E" strokeWidth="10" />

        {/* logs */}
        <g>
          <rect x="102" y="256" width="156" height="22" rx="11" fill="#4A2E18" transform="rotate(-6 180 267)" />
          <rect x="112" y="266" width="140" height="22" rx="11" fill="#3A2211" transform="rotate(5 180 277)" />
          <circle cx="112" cy="266" r="10" fill="#6B4423" transform="rotate(-6 180 267)" />
          <circle cx="252" cy="277" r="10" fill="#5B3A1C" transform="rotate(5 180 277)" />
        </g>

        {/* embers */}
        <ellipse cx="180" cy="286" rx="70" ry="10" fill="url(#fp-ember)" className="fp-ember" />

        {/* flames: three tongues at different rhythms */}
        <g className="fp-flames" filter="url(#fp-blur)">
          <path className="fp-flame fp-flame-a" d="M180 268 C 150 240, 160 205, 178 176 C 182 205, 200 215, 196 236 C 210 226, 212 210, 206 196 C 226 222, 216 258, 180 268 Z" fill="url(#fp-flame)" />
          <path className="fp-flame fp-flame-b" d="M150 270 C 130 250, 136 224, 150 206 C 152 226, 166 232, 162 246 C 172 240, 172 228, 168 220 C 182 240, 176 262, 150 270 Z" fill="url(#fp-flame)" opacity="0.85" />
          <path className="fp-flame fp-flame-c" d="M212 270 C 194 254, 198 230, 212 212 C 214 230, 226 236, 222 250 C 232 244, 232 232, 228 224 C 242 244, 236 264, 212 270 Z" fill="url(#fp-flame)" opacity="0.8" />
        </g>
        <g className="fp-sparks">
          <circle cx="170" cy="200" r="1.6" fill="#FFD27A" className="fp-spark fp-spark-1" />
          <circle cx="192" cy="190" r="1.2" fill="#FFB347" className="fp-spark fp-spark-2" />
          <circle cx="182" cy="180" r="1.4" fill="#FFE1A0" className="fp-spark fp-spark-3" />
        </g>

        {/* things on the mantel */}
        <rect x="52" y="20" width="24" height="24" rx="3" fill="#8B3D50" />
        <rect x="80" y="14" width="18" height="30" rx="2" fill="#3D6B5A" />
        <rect x="100" y="24" width="30" height="20" rx="2" fill="#4A5A6B" />
        <circle cx="300" cy="30" r="12" fill="#D9A45C" />
        <rect x="288" y="30" width="24" height="14" rx="2" fill="#8A6A3A" />
      </svg>
    </div>
  );
}

const STONES: [number, number, number, number][] = [
  [40, 70, 60, 26], [104, 70, 74, 26], [182, 70, 58, 26], [244, 70, 76, 26],
  [40, 100, 36, 26], [40, 130, 40, 26], [40, 160, 36, 26], [40, 190, 40, 26], [40, 220, 36, 26], [40, 250, 40, 26], [40, 280, 36, 22],
  [284, 100, 36, 26], [280, 130, 40, 26], [284, 160, 36, 26], [280, 190, 40, 26], [284, 220, 36, 26], [280, 250, 40, 26], [284, 280, 36, 22],
];

const CSS = `
.bs-fireplace { position: fixed; right: 18px; bottom: 0; width: 360px; height: 320px; z-index: 1; pointer-events: none; display: none; }
@media (min-width: 1500px) { .bs-fireplace { display: block; } }
.bs-fireplace-svg { width: 100%; height: 100%; display: block; filter: drop-shadow(0 18px 30px rgba(0,0,0,0.6)); }
.fp-flame { transform-box: fill-box; transform-origin: 50% 100%; }
.fp-flame-a { animation: fp-flicker-a 1.1s ease-in-out infinite alternate; }
.fp-flame-b { animation: fp-flicker-b 0.9s ease-in-out infinite alternate; }
.fp-flame-c { animation: fp-flicker-c 1.3s ease-in-out infinite alternate; }
@keyframes fp-flicker-a { 0% { transform: scale(1, 1) skewX(-2deg); } 50% { transform: scale(1.06, 1.12) skewX(3deg); } 100% { transform: scale(0.96, 0.94) skewX(-1deg); } }
@keyframes fp-flicker-b { 0% { transform: scale(1, 0.9) skewX(3deg); } 100% { transform: scale(1.08, 1.15) skewX(-3deg); } }
@keyframes fp-flicker-c { 0% { transform: scale(0.95, 1.1) skewX(-3deg); } 100% { transform: scale(1.05, 0.9) skewX(2deg); } }
.fp-ember { animation: fp-ember 1.6s ease-in-out infinite alternate; }
@keyframes fp-ember { 0% { opacity: 0.55; } 100% { opacity: 1; } }
.fp-spark { transform-box: fill-box; transform-origin: center; animation: fp-spark 2.6s ease-out infinite; }
.fp-spark-2 { animation-delay: 0.9s; } .fp-spark-3 { animation-delay: 1.7s; }
@keyframes fp-spark { 0% { opacity: 0; transform: translateY(20px); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateY(-70px) translateX(6px); } }
.fp-floorglow { animation: fp-ember 1.3s ease-in-out infinite alternate; }
@media (prefers-reduced-motion: reduce) { .bs-fireplace * { animation: none !important; } }
`;
