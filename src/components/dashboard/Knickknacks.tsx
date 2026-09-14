"use client";

// Objects that live on the mantle shelf above the books. Inline SVG, warm palette,
// no image assets. Each one is a small still life from a writer's desk: the things
// D.Scribe is about (a microphone, ink, paper) plus the company they keep (coffee,
// a candle, a plant). Every object sits on a common baseline (y = 100) so they
// line up on the plank.

export type KnickknackKind = "mic" | "inkwell" | "coffee" | "candle" | "manuscript" | "plant" | "hourglass" | "lamp";

const BRASS = "#D9A45C";
const BRASS_DARK = "#8A6A3A";
const COPPER = "#C17A47";
const INK = "#2C2419";
const PARCH = "#F4ECDC";
const PARCH_DARK = "#D9C7A3";
const SAGE = "#6B7B5E";
const SAGE_DARK = "#4A5A40";
const WINE = "#8B3D50";
const CREAM = "#F9F7F2";

export function Knickknack({ kind, className }: { kind: KnickknackKind; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="kk-brass" x1="0" x2="1">
          <stop offset="0" stopColor="#F0D6A8" />
          <stop offset="0.5" stopColor={BRASS} />
          <stop offset="1" stopColor={BRASS_DARK} />
        </linearGradient>
        <linearGradient id="kk-ink" x1="0" x2="1">
          <stop offset="0" stopColor="#4A3D2C" />
          <stop offset="0.6" stopColor={INK} />
          <stop offset="1" stopColor="#15100B" />
        </linearGradient>
        <linearGradient id="kk-copper" x1="0" x2="1">
          <stop offset="0" stopColor="#E29B6D" />
          <stop offset="0.6" stopColor={COPPER} />
          <stop offset="1" stopColor="#8A5230" />
        </linearGradient>
        <linearGradient id="kk-sage" x1="0" x2="1">
          <stop offset="0" stopColor="#8A9C7A" />
          <stop offset="0.6" stopColor={SAGE} />
          <stop offset="1" stopColor={SAGE_DARK} />
        </linearGradient>
        <linearGradient id="kk-wine" x1="0" x2="1">
          <stop offset="0" stopColor="#B05A6E" />
          <stop offset="0.6" stopColor={WINE} />
          <stop offset="1" stopColor="#5A2434" />
        </linearGradient>
        <radialGradient id="kk-flame" cx="0.5" cy="0.7" r="0.6">
          <stop offset="0" stopColor="#FFF4C8" />
          <stop offset="0.45" stopColor="#FFC15A" />
          <stop offset="1" stopColor="#E05D3A" stopOpacity="0.1" />
        </radialGradient>
      </defs>
      {/* contact shadow on the plank */}
      <ellipse cx="50" cy="100" rx="30" ry="4" fill="rgba(0,0,0,0.45)" />
      {kind === "mic" && <Mic />}
      {kind === "inkwell" && <Inkwell />}
      {kind === "coffee" && <Coffee />}
      {kind === "candle" && <Candle />}
      {kind === "manuscript" && <Manuscript />}
      {kind === "plant" && <Plant />}
      {kind === "hourglass" && <Hourglass />}
      {kind === "lamp" && <Lamp />}
    </svg>
  );
}

function Mic() {
  return (
    <g>
      {/* base + stand */}
      <ellipse cx="50" cy="96" rx="20" ry="5" fill="url(#kk-ink)" />
      <rect x="47" y="52" width="6" height="44" fill="url(#kk-ink)" />
      {/* yoke */}
      <path d="M32 44 v14 a18 18 0 0 0 36 0 v-14" fill="none" stroke={BRASS_DARK} strokeWidth="4" />
      {/* capsule */}
      <rect x="36" y="12" width="28" height="44" rx="14" fill="url(#kk-copper)" />
      <rect x="40" y="16" width="20" height="30" rx="10" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1.5" />
      {Array.from({ length: 5 }).map((_, i) => (
        <line key={i} x1="41" x2="59" y1={20 + i * 6} y2={20 + i * 6} stroke="rgba(0,0,0,0.3)" strokeWidth="1.2" />
      ))}
      <rect x="44" y="56" width="12" height="6" rx="2" fill={BRASS} />
    </g>
  );
}

function Inkwell() {
  return (
    <g>
      {/* well */}
      <path d="M30 96 h40 l-4 -34 h-32 z" fill="url(#kk-ink)" />
      <rect x="36" y="52" width="28" height="12" rx="3" fill={BRASS_DARK} />
      <rect x="40" y="46" width="20" height="8" rx="2" fill="url(#kk-brass)" />
      <ellipse cx="50" cy="63" rx="9" ry="3" fill="#0B0806" />
      {/* quill */}
      <path d="M56 60 C 62 40, 74 22, 92 8 C 84 30, 76 46, 60 66 Z" fill={PARCH} stroke={PARCH_DARK} strokeWidth="1" />
      <path d="M58 64 C 66 44, 76 30, 90 12" stroke={COPPER} strokeWidth="1.2" fill="none" />
      <path d="M56 62 l4 6" stroke={INK} strokeWidth="2" />
    </g>
  );
}

function Coffee() {
  return (
    <g>
      <path d="M28 52 h44 l-5 44 h-34 z" fill={CREAM} stroke={PARCH_DARK} strokeWidth="1.5" />
      <path d="M30 52 h40" stroke={COPPER} strokeWidth="6" />
      <path d="M72 60 c14 0 14 22 0 22" fill="none" stroke={CREAM} strokeWidth="6" />
      <path d="M72 60 c14 0 14 22 0 22" fill="none" stroke={PARCH_DARK} strokeWidth="1.5" />
      <ellipse cx="50" cy="52" rx="22" ry="5" fill="#3B2410" />
      {/* steam */}
      <path className="kk-steam" d="M40 44 c-4 -6 4 -10 0 -16" fill="none" stroke="rgba(249,247,242,0.55)" strokeWidth="2" strokeLinecap="round" />
      <path className="kk-steam kk-steam-2" d="M52 42 c-4 -6 4 -10 0 -16" fill="none" stroke="rgba(249,247,242,0.55)" strokeWidth="2" strokeLinecap="round" />
      <path className="kk-steam kk-steam-3" d="M62 44 c-4 -6 4 -10 0 -16" fill="none" stroke="rgba(249,247,242,0.4)" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

function Candle() {
  return (
    <g>
      {/* holder */}
      <ellipse cx="50" cy="94" rx="24" ry="6" fill="url(#kk-brass)" />
      <rect x="38" y="84" width="24" height="10" rx="2" fill={BRASS_DARK} />
      <path d="M62 88 c10 0 10 -8 0 -8" fill="none" stroke={BRASS} strokeWidth="3" />
      {/* candle */}
      <rect x="41" y="40" width="18" height="46" rx="2" fill={CREAM} stroke={PARCH_DARK} strokeWidth="1" />
      <path d="M41 42 q4 6 9 -2 q4 8 9 2" fill={CREAM} />
      <rect x="49" y="32" width="2" height="9" fill={INK} />
      {/* flame */}
      <g className="kk-flame">
        <ellipse cx="50" cy="26" rx="9" ry="14" fill="url(#kk-flame)" />
        <ellipse cx="50" cy="28" rx="3.5" ry="7" fill="#FFF7D6" />
      </g>
    </g>
  );
}

function Manuscript() {
  return (
    <g>
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={22 + i * 1.5} y={92 - i * 5} width="56" height="5" fill={i % 2 ? PARCH : CREAM} stroke={PARCH_DARK} strokeWidth="0.8" />
      ))}
      <rect x="29" y="30" width="56" height="42" rx="1" fill={CREAM} stroke={PARCH_DARK} strokeWidth="1" transform="rotate(-4 57 51)" />
      {Array.from({ length: 6 }).map((_, i) => (
        <line key={i} x1="36" x2={i === 5 ? 60 : 78} y1={40 + i * 5.5} y2={40 + i * 5.5} stroke="rgba(44,36,25,0.35)" strokeWidth="1.2" transform="rotate(-4 57 51)" />
      ))}
      {/* ribbon */}
      <path d="M34 72 v18 l5 -4 l5 4 v-18 z" fill="url(#kk-wine)" />
      <circle cx="79" cy="36" r="6" fill="url(#kk-copper)" transform="rotate(-4 57 51)" />
    </g>
  );
}

function Plant() {
  return (
    <g>
      <path d="M32 66 h36 l-4 30 h-28 z" fill="url(#kk-copper)" />
      <rect x="29" y="60" width="42" height="8" rx="2" fill="#8A5230" />
      <ellipse cx="50" cy="62" rx="16" ry="4" fill="#3B2410" />
      <path d="M50 62 C 44 46, 30 40, 20 42 C 28 52, 40 56, 50 62 Z" fill="url(#kk-sage)" />
      <path d="M50 62 C 56 44, 70 36, 82 40 C 74 50, 60 56, 50 62 Z" fill="url(#kk-sage)" />
      <path d="M50 62 C 46 44, 48 30, 52 22 C 58 32, 56 48, 50 62 Z" fill="url(#kk-sage)" />
      <path d="M50 62 C 40 52, 26 54, 18 62 C 30 64, 42 64, 50 62 Z" fill={SAGE_DARK} />
      <path d="M50 62 C 60 52, 74 54, 82 62 C 70 64, 58 64, 50 62 Z" fill={SAGE_DARK} />
    </g>
  );
}

function Hourglass() {
  return (
    <g>
      <rect x="28" y="88" width="44" height="8" rx="2" fill="url(#kk-brass)" />
      <rect x="28" y="20" width="44" height="8" rx="2" fill="url(#kk-brass)" />
      <rect x="31" y="28" width="4" height="60" fill={BRASS_DARK} />
      <rect x="65" y="28" width="4" height="60" fill={BRASS_DARK} />
      <path d="M36 28 h28 c0 14 -8 22 -14 30 c-6 -8 -14 -16 -14 -30 z" fill="rgba(249,247,242,0.18)" stroke="rgba(249,247,242,0.5)" strokeWidth="1" />
      <path d="M36 88 h28 c0 -14 -8 -22 -14 -30 c-6 8 -14 16 -14 30 z" fill="rgba(249,247,242,0.18)" stroke="rgba(249,247,242,0.5)" strokeWidth="1" />
      <path d="M40 30 h20 c0 8 -6 14 -10 18 c-4 -4 -10 -10 -10 -18 z" fill={PARCH_DARK} />
      <path d="M38 88 h24 c0 -8 -8 -10 -12 -12 c-4 2 -12 4 -12 12 z" fill={PARCH_DARK} />
      <rect x="49.4" y="52" width="1.2" height="26" fill={PARCH_DARK} />
    </g>
  );
}

function Lamp() {
  return (
    <g>
      <ellipse cx="50" cy="94" rx="20" ry="5" fill="url(#kk-brass)" />
      <rect x="47" y="40" width="6" height="52" fill={BRASS_DARK} />
      <path d="M22 44 h56 l-10 -22 h-36 z" fill="url(#kk-sage)" />
      <path d="M22 44 h56" stroke={BRASS} strokeWidth="3" />
      <path d="M26 46 h48 l6 8 h-60 z" fill="rgba(255,214,150,0.28)" />
      <ellipse cx="50" cy="60" rx="34" ry="14" fill="rgba(255,214,150,0.12)" />
    </g>
  );
}
