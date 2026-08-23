"use client";

/** Tutorial slide illustrations: small stylized SVG vignettes of each page's UI,
 *  drawn in the paper theme. Animation classes (ds-tut-anim-*) get their
 *  keyframes from StepTutorialModal, which also disables them under
 *  prefers-reduced-motion. */

const INK = "#2C2419";
const ACCENT = "#C17A47";
const MUTED2 = "rgba(44,36,25,0.32)";
const SANS = "var(--font-manrope), sans-serif";
const MONO = "var(--font-geist-mono), ui-monospace, monospace";

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 280 150"
      width="100%"
      role="img"
      aria-label={label}
      style={{ display: "block", maxHeight: 190 }}
    >
      {children}
    </svg>
  );
}

function Card(p: { x: number; y: number; w: number; h: number; r?: number; fill?: string; stroke?: string; dash?: boolean }) {
  return (
    <rect
      x={p.x} y={p.y} width={p.w} height={p.h} rx={p.r ?? 8}
      fill={p.fill ?? "#FFFFFF"}
      stroke={p.stroke ?? "rgba(44,36,25,0.16)"}
      strokeWidth={1.2}
      strokeDasharray={p.dash ? "4 3" : undefined}
    />
  );
}

/** Rows of muted bars standing in for text. */
function TextLines(p: { x: number; y: number; w: number; n?: number; gap?: number; color?: string; h?: number }) {
  const n = p.n ?? 3;
  const gap = p.gap ?? 8;
  const h = p.h ?? 3.5;
  const widths = [1, 0.86, 0.94, 0.7, 0.9, 0.8];
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => (
        <rect key={i} x={p.x} y={p.y + i * gap} width={p.w * widths[i % widths.length]} height={h} rx={h / 2} fill={p.color ?? MUTED2} opacity={0.7} />
      ))}
    </g>
  );
}

function Pill(p: { x: number; y: number; w: number; h?: number; label: string; fill?: string; color?: string; fs?: number; className?: string }) {
  const h = p.h ?? 20;
  return (
    <g className={p.className}>
      <rect x={p.x} y={p.y} width={p.w} height={h} rx={h / 2} fill={p.fill ?? ACCENT} />
      <text x={p.x + p.w / 2} y={p.y + h / 2 + 3} textAnchor="middle" fontSize={p.fs ?? 8.5} fontWeight={700} fill={p.color ?? "#F9F7F2"} fontFamily={SANS}>
        {p.label}
      </text>
    </g>
  );
}

function Tag(p: { x: number; y: number; label: string; light?: boolean }) {
  return (
    <text x={p.x} y={p.y} fontSize={6.5} letterSpacing="0.08em" fontWeight={700} fontFamily={MONO} fill={p.light ? "rgba(249,247,242,0.6)" : "rgba(44,36,25,0.45)"}>
      {p.label}
    </text>
  );
}

/** Classic pointer-arrow cursor. */
function Cursor(p: { x: number; y: number; className?: string }) {
  return (
    <g className={p.className} transform={`translate(${p.x}, ${p.y})`}>
      <path d="M0 0 L0 13 L3.4 10.2 L5.6 15 L8 13.8 L5.8 9.2 L10 8.6 Z" fill={INK} stroke="#F9F7F2" strokeWidth={1} />
    </g>
  );
}

/** Sticky note with a couple of text bars. */
function Note(p: { x: number; y: number; w?: number; h?: number; fill?: string; className?: string; hot?: boolean }) {
  const w = p.w ?? 52;
  const h = p.h ?? 30;
  return (
    <g className={p.className} transform={`translate(${p.x}, ${p.y})`}>
      <rect width={w} height={h} rx={3} fill={p.fill ?? "#fdf5c9"} stroke={p.hot ? ACCENT : "rgba(44,36,25,0.18)"} strokeWidth={p.hot ? 1.6 : 1} />
      <rect x={7} y={9} width={w - 16} height={3} rx={1.5} fill={MUTED2} opacity={0.6} />
      <rect x={7} y={17} width={w - 26} height={3} rx={1.5} fill={MUTED2} opacity={0.45} />
    </g>
  );
}

/* ── Upload ─────────────────────────────────────────────────────────── */

export function IlUploadFour() {
  return (
    <Frame label="The four upload options: brainstorm, record live, audio files, and YouTube">
      <Card x={10} y={12} w={126} h={60} fill={INK} stroke="rgba(193,122,71,0.5)" />
      <Tag x={20} y={26} label="01 BRAINSTORM" light />
      <circle cx={38} cy={48} r={11} fill={ACCENT} className="ds-tut-anim-pulse" />
      <TextLines x={58} y={42} w={64} n={2} color="rgba(249,247,242,0.5)" />

      <Card x={144} y={12} w={126} h={60} />
      <Tag x={154} y={26} label="02 RECORD LIVE" />
      <rect x={168} y={36} width={44} height={26} rx={4} fill="rgba(44,36,25,0.06)" stroke={MUTED2} />
      <circle cx={181} cy={49} r={6} fill="none" stroke={MUTED2} strokeWidth={1.5} />
      <circle cx={199} cy={49} r={6} fill="none" stroke={MUTED2} strokeWidth={1.5} />
      <circle cx={236} cy={49} r={7} fill="#C1442E" className="ds-tut-anim-pulse" />

      <Card x={10} y={80} w={126} h={60} dash stroke="rgba(193,122,71,0.65)" fill="rgba(193,122,71,0.05)" />
      <Tag x={20} y={94} label="03 AUDIO FILES" />
      <g transform="translate(46, 102)">
        <rect x={0} y={4} width={22} height={26} rx={3} fill="#fff" stroke={MUTED2} />
        <rect x={12} y={0} width={22} height={26} rx={3} fill="#fff" stroke={MUTED2} />
        <path d="M50 8 v14 M44 16 l6 6 l6 -6" stroke={ACCENT} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" className="ds-tut-anim-bob" />
      </g>

      <Card x={144} y={80} w={126} h={60} />
      <Tag x={154} y={94} label="04 YOUTUBE" />
      <rect x={162} y={104} width={62} height={12} rx={6} fill="rgba(44,36,25,0.07)" />
      <rect x={166} y={108} width={40} height={3.5} rx={1.75} fill={MUTED2} opacity={0.6} />
      <g transform="translate(238, 100)">
        <rect width={26} height={19} rx={5} fill="#C1442E" />
        <path d="M10 5.5 L18 9.5 L10 13.5 Z" fill="#fff" />
      </g>
    </Frame>
  );
}

export function IlBrainstorm() {
  return (
    <Frame label="A live brainstorm session with T.H.E.O: he asks, you talk">
      <Card x={10} y={10} w={260} h={130} fill={INK} stroke="rgba(193,122,71,0.5)" r={12} />
      <circle cx={52} cy={62} r={17} fill={ACCENT} className="ds-tut-anim-pulse" />
      <circle cx={52} cy={62} r={26} fill="none" stroke="rgba(193,122,71,0.35)" strokeWidth={1.5} className="ds-tut-anim-pulse" />
      <Tag x={36} y={104} label="T.H.E.O · LIVE" light />

      <rect x={92} y={30} width={130} height={26} rx={9} fill="rgba(249,247,242,0.12)" />
      <TextLines x={102} y={40} w={110} n={2} gap={7} color="rgba(249,247,242,0.55)" h={3} />
      <rect x={116} y={66} width={140} height={26} rx={9} fill="rgba(193,122,71,0.3)" />
      <TextLines x={126} y={76} w={120} n={2} gap={7} color="rgba(249,247,242,0.75)" h={3} />
      <rect x={92} y={102} width={104} height={22} rx={8} fill="rgba(249,247,242,0.12)" className="ds-tut-anim-blink" />
      <TextLines x={102} y={111} w={84} n={1} color="rgba(249,247,242,0.55)" h={3} />
    </Frame>
  );
}

export function IlTranscribe() {
  return (
    <Frame label="Your sources become one transcript when you press Transcribe">
      <g className="ds-tut-anim-bob">
        <rect x={22} y={26} width={34} height={42} rx={4} fill="#fff" stroke={MUTED2} />
        <rect x={34} y={38} width={34} height={42} rx={4} fill="#fff" stroke={MUTED2} />
        <rect x={46} y={50} width={34} height={42} rx={4} fill="#fff" stroke={MUTED2} />
      </g>
      <path d="M96 60 h34 m-8 -7 l8 7 l-8 7" stroke={ACCENT} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Card x={148} y={22} w={110} h={78} r={6} />
      <TextLines x={160} y={36} w={86} n={6} gap={10} />
      <Pill x={158} y={112} w={106} h={24} label="Transcribe →" fs={10} className="ds-tut-anim-pulse" />
      <Cursor x={244} y={122} className="ds-tut-anim-nudge" />
    </Frame>
  );
}

/* ── Transcript ─────────────────────────────────────────────────────── */

export function IlEditParagraph() {
  return (
    <Frame label="Click any paragraph of the transcript to edit it in place">
      <Card x={36} y={10} w={208} h={130} r={6} />
      <circle cx={54} cy={30} r={5} fill={MUTED2} />
      <TextLines x={68} y={24} w={150} n={2} gap={8} />
      <g>
        <rect x={46} y={52} width={186} height={34} rx={6} fill="rgba(193,122,71,0.1)" stroke={ACCENT} strokeWidth={1.4} className="ds-tut-anim-blink" />
        <circle cx={62} cy={66} r={5} fill={ACCENT} />
        <TextLines x={76} y={60} w={140} n={3} gap={8} />
      </g>
      <circle cx={54} cy={104} r={5} fill={MUTED2} />
      <TextLines x={68} y={98} w={150} n={2} gap={8} />
      <Cursor x={196} y={72} className="ds-tut-anim-nudge" />
      <Pill x={186} y={118} w={46} h={16} label="Save" fs={8} />
    </Frame>
  );
}

export function IlViews() {
  return (
    <Frame label="Two reading views: Segments with speakers, or Full text prose">
      <Pill x={62} y={12} w={74} h={18} label="Segments" fs={8} />
      <Pill x={142} y={12} w={74} h={18} label="Full text" fill="rgba(44,36,25,0.08)" color="rgba(44,36,25,0.6)" fs={8} />
      <Card x={22} y={42} w={112} h={96} r={6} />
      <circle cx={38} cy={60} r={4.5} fill={ACCENT} />
      <TextLines x={50} y={55} w={70} n={2} gap={7} />
      <circle cx={38} cy={90} r={4.5} fill={MUTED2} />
      <TextLines x={50} y={85} w={70} n={2} gap={7} />
      <circle cx={38} cy={120} r={4.5} fill={ACCENT} />
      <TextLines x={50} y={115} w={70} n={2} gap={7} />
      <Card x={146} y={42} w={112} h={96} r={6} />
      <TextLines x={158} y={56} w={88} n={8} gap={10} />
    </Frame>
  );
}

/* ── Structure ──────────────────────────────────────────────────────── */

export function IlStructure() {
  return (
    <Frame label="Set chapter count, words per chapter, and your target reader">
      <Card x={26} y={10} w={228} h={130} r={10} />
      <Tag x={40} y={30} label="01 — CHAPTERS" />
      <text x={40} y={58} fontSize={26} fontWeight={300} fill={INK} fontFamily={SANS}>8</text>
      <g className="ds-tut-anim-bob">
        <rect x={64} y={36} width={20} height={12} rx={3} fill="none" stroke={MUTED2} />
        <path d="M70 43.5 l4 -4 l4 4" stroke={ACCENT} strokeWidth={1.6} fill="none" strokeLinecap="round" />
        <rect x={64} y={50} width={20} height={12} rx={3} fill="none" stroke={MUTED2} />
        <path d="M70 54.5 l4 4 l4 -4" stroke={MUTED2} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      </g>
      <Tag x={150} y={30} label="02 — WORDS / CH" />
      <text x={150} y={58} fontSize={26} fontWeight={300} fill={INK} fontFamily={SANS}>2,500</text>
      <Tag x={40} y={84} label="03 — AUDIENCE" />
      <Pill x={40} y={92} w={54} h={17} label="General" fs={7.5} />
      <Pill x={100} y={92} w={44} h={17} label="Faith" fill="rgba(44,36,25,0.07)" color="rgba(44,36,25,0.6)" fs={7.5} />
      <Pill x={150} y={92} w={58} h={17} label="Business" fill="rgba(44,36,25,0.07)" color="rgba(44,36,25,0.6)" fs={7.5} />
      <text x={40} y={128} fontSize={8} fill="rgba(44,36,25,0.5)" fontFamily={MONO}>~20,000 WORDS · ABOUT 80 PAGES</text>
    </Frame>
  );
}

/* ── Analysis ───────────────────────────────────────────────────────── */

export function IlMindMap() {
  return (
    <Frame label="The outline mind map: chapter cards in columns with key-point sticky notes below">
      <path d="M62 32 Q 140 8 218 32" stroke="rgba(44,36,25,0.18)" strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <path d="M62 32 Q 100 14 140 30" stroke="rgba(44,36,25,0.14)" strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <g transform="rotate(-2 62 60)">
        <Note x={34} y={24} w={56} h={24} fill="#fdf5c9" />
        <Note x={40} y={58} fill="#fdf5c9" />
        <Note x={40} y={94} fill="#fdf5c9" />
      </g>
      <g transform="rotate(1.5 140 60)">
        <Note x={112} y={22} w={56} h={24} fill="#fbe0e0" />
        <Note x={118} y={56} fill="#fbe0e0" />
        <Note x={118} y={92} fill="#fbe0e0" />
        <Note x={118} y={126} w={52} h={20} fill="#fbe0e0" />
      </g>
      <g transform="rotate(-1 218 60)">
        <Note x={190} y={24} w={56} h={24} fill="#e0f2fe" />
        <Note x={196} y={58} fill="#e0f2fe" />
      </g>
      <Tag x={36} y={16} label="CH 1" />
      <Tag x={114} y={14} label="CH 2" />
      <Tag x={192} y={16} label="CH 3" />
    </Frame>
  );
}

export function IlDragNote() {
  return (
    <Frame label="Dragging a key-point note from one chapter's column into another">
      <Note x={40} y={18} w={58} h={24} fill="#fdf5c9" />
      <Note x={44} y={52} fill="#fdf5c9" />
      <rect x={40} y={88} width={60} height={34} rx={4} fill="none" stroke="rgba(44,36,25,0.2)" strokeDasharray="3 3" opacity={0.6} />
      <rect x={176} y={12} width={76} height={126} rx={8} fill="rgba(224,242,254,0.35)" stroke="rgba(126,200,240,0.8)" strokeWidth={2} strokeDasharray="5 4" className="ds-tut-anim-blink" />
      <Note x={186} y={20} w={58} h={24} fill="#e0f2fe" />
      <Note x={190} y={54} fill="#e0f2fe" />
      <g className="ds-tut-anim-drag">
        <Note x={44} y={88} fill="#fdf5c9" hot />
        <Cursor x={82} y={104} />
      </g>
    </Frame>
  );
}

export function IlNoteTools() {
  return (
    <Frame label="The canvas toolbar: undo, redo, colored add-chapter buttons, and note controls">
      <Note x={52} y={14} w={62} h={26} fill="#fdf5c9" />
      <g className="ds-tut-anim-pulse">
        <circle cx={122} cy={20} r={7} fill="#fff" stroke={ACCENT} strokeWidth={1.4} />
        <path d="M119 20 h6 M122 17 v6" stroke={ACCENT} strokeWidth={1.6} strokeLinecap="round" />
      </g>
      <Note x={58} y={50} fill="#fdf5c9" />
      <g>
        <circle cx={118} cy={56} r={6} fill="#fff" stroke="#C1442E" strokeWidth={1.3} />
        <path d="M115.5 53.5 l5 5 M120.5 53.5 l-5 5" stroke="#C1442E" strokeWidth={1.4} strokeLinecap="round" />
      </g>
      <Note x={168} y={30} w={58} h={40} fill="#e6f4ea" />
      <rect x={176} y={40} width={40} height={5} rx={2} fill="rgba(44,36,25,0.25)" className="ds-tut-anim-blink" />
      <Cursor x={210} y={46} className="ds-tut-anim-nudge" />
      <g>
        <rect x={44} y={108} width={192} height={30} rx={15} fill="#fff" stroke="rgba(44,36,25,0.14)" />
        <text x={60} y={127} fontSize={11} fill={INK} fontFamily={SANS}>↩ ↪</text>
        {["#fdf5c9", "#fbe0e0", "#e0f2fe", "#e6f4ea"].map((c, i) => (
          <g key={c}>
            <circle cx={106 + i * 20} cy={123} r={7} fill={c} stroke="rgba(44,36,25,0.25)" />
            <text x={106 + i * 20} y={126.5} textAnchor="middle" fontSize={9} fill={INK} fontFamily={SANS}>+</text>
          </g>
        ))}
        <Pill x={190} y={113} w={38} h={20} label="Go →" fill={INK} fs={8} />
      </g>
    </Frame>
  );
}

export function IlExpandOutline() {
  return (
    <Frame label="New key points from later uploads can be previewed and added as chapters">
      <rect x={26} y={14} width={228} height={34} rx={8} fill="rgba(217,119,6,0.1)" stroke="rgba(217,119,6,0.35)" />
      <TextLines x={40} y={26} w={110} n={2} gap={8} color="#92400e" />
      <Pill x={166} y={21} w={78} h={20} label="Preview →" fill="#92400e" fs={8.5} className="ds-tut-anim-pulse" />
      <Note x={48} y={64} w={56} h={24} fill="#fdf5c9" />
      <Note x={52} y={96} fill="#fdf5c9" />
      <Note x={120} y={64} w={56} h={24} fill="#fbe0e0" />
      <Note x={124} y={96} fill="#fbe0e0" />
      <g className="ds-tut-anim-blink">
        <Note x={192} y={64} w={56} h={24} fill="#e6f4ea" hot />
        <Note x={196} y={96} fill="#e6f4ea" hot />
      </g>
      <text x={196} y={58} fontSize={7} fontWeight={700} fill={ACCENT} fontFamily={MONO}>NEW</text>
    </Frame>
  );
}

/* ── Generate ───────────────────────────────────────────────────────── */

export function IlGenerate() {
  return (
    <Frame label="Pick a chapter, set creative freedom, then Generate">
      <Card x={16} y={14} w={82} h={122} r={8} />
      <Tag x={26} y={30} label="CHAPTERS" />
      <TextLines x={26} y={42} w={60} n={5} gap={13} />
      <rect x={22} y={62} width={70} height={12} rx={4} fill="rgba(193,122,71,0.15)" />
      <Card x={110} y={14} w={154} h={122} r={8} />
      <Tag x={122} y={32} label="CREATIVE FREEDOM" />
      <rect x={122} y={40} width={130} height={5} rx={2.5} fill="url(#dsTutSliderGrad)" />
      <defs>
        <linearGradient id="dsTutSliderGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="50%" stopColor="#ffd700" />
          <stop offset="100%" stopColor={ACCENT} />
        </linearGradient>
      </defs>
      <circle cx={186} cy={42.5} r={7} fill={INK} className="ds-tut-anim-bob" />
      <TextLines x={122} y={62} w={128} n={3} gap={9} />
      <Pill x={122} y={100} w={80} h={22} label="Generate" fs={9} className="ds-tut-anim-pulse" />
      <Pill x={208} y={100} w={44} h={22} label="All 8" fill={INK} fs={9} />
      <Cursor x={188} y={112} className="ds-tut-anim-nudge" />
    </Frame>
  );
}

export function IlQuotes() {
  return (
    <Frame label="Enrichment quotes: tick the ones to weave in, refresh for new ones">
      <Tag x={24} y={22} label="ENRICHMENT QUOTES" />
      <Pill x={172} y={10} w={84} h={19} label="↻ New quotes" fill="rgba(193,122,71,0.12)" color="#A05526" fs={8} className="ds-tut-anim-pulse" />
      {[0, 1, 2].map((i) => {
        const on = i !== 1;
        const y = 36 + i * 36;
        return (
          <g key={i} opacity={on ? 1 : 0.45}>
            <rect x={24} y={y} width={232} height={28} rx={6} fill={on ? "rgba(193,122,71,0.07)" : "rgba(44,36,25,0.04)"} />
            <rect x={24} y={y} width={3} height={28} rx={1.5} fill={on ? ACCENT : "transparent"} />
            <rect x={36} y={y + 7} width={13} height={13} rx={3} fill={on ? ACCENT : "none"} stroke={on ? ACCENT : MUTED2} strokeWidth={1.5} />
            {on && <path d={`M39 ${y + 13.5} l3 3 l5 -6`} stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
            <TextLines x={58} y={y + 8} w={180} n={2} gap={8} h={3} />
          </g>
        );
      })}
      <Cursor x={44} y={84} className="ds-tut-anim-nudge" />
    </Frame>
  );
}

export function IlForeword() {
  return (
    <Frame label="The foreword toggle: include an AI-written opening chapter">
      <Card x={30} y={40} w={220} h={54} r={10} />
      <text x={46} y={62} fontSize={11} fontWeight={700} fill={INK} fontFamily={SANS}>Include Foreword</text>
      <TextLines x={46} y={72} w={120} n={1} h={3} />
      <g>
        <rect x={200} y={56} width={38} height={20} rx={10} fill={ACCENT} />
        <circle cx={228} cy={66} r={8} fill="#fff" className="ds-tut-anim-toggle" />
      </g>
      <g transform="translate(112, 104)" className="ds-tut-anim-bob">
        <rect width={56} height={36} rx={4} fill="#fff" stroke={MUTED2} />
        <rect x={8} y={8} width={40} height={3.5} rx={1.75} fill={ACCENT} opacity={0.8} />
        <rect x={8} y={16} width={34} height={3} rx={1.5} fill={MUTED2} opacity={0.6} />
        <rect x={8} y={23} width={38} height={3} rx={1.5} fill={MUTED2} opacity={0.6} />
      </g>
    </Frame>
  );
}

/* ── Editor ─────────────────────────────────────────────────────────── */

export function IlEditSave() {
  return (
    <Frame label="Type directly on the page, then press Save Changes">
      <Card x={40} y={10} w={200} h={104} r={4} />
      <rect x={62} y={10} width={1.4} height={104} fill="rgba(193,122,71,0.25)" />
      <rect x={74} y={24} width={70} height={6} rx={3} fill={INK} opacity={0.8} />
      <TextLines x={74} y={42} w={148} n={5} gap={11} />
      <rect x={168} y={84} width={2} height={12} fill={ACCENT} className="ds-tut-anim-blink" />
      <Pill x={158} y={122} w={94} h={22} label="Save Changes" fs={9} className="ds-tut-anim-pulse" />
      <Cursor x={236} y={132} className="ds-tut-anim-nudge" />
    </Frame>
  );
}

export function IlMagicEdit() {
  return (
    <Frame label="Select a passage and the Magic Edit bubble appears above it">
      <Card x={40} y={14} w={200} h={122} r={4} />
      <TextLines x={58} y={30} w={164} n={2} gap={11} />
      <rect x={54} y={56} width={172} height={22} rx={4} fill="rgba(193,122,71,0.18)" className="ds-tut-anim-blink" />
      <TextLines x={58} y={62} w={164} n={2} gap={9} h={3} />
      <TextLines x={58} y={92} w={164} n={3} gap={11} />
      <g className="ds-tut-anim-bob">
        <rect x={84} y={100} width={130} height={26} rx={13} fill={INK} />
        <text x={100} y={117} fontSize={11} fill="#F9C97B" fontFamily={SANS}>✦</text>
        <rect x={114} y={110} width={78} height={5} rx={2.5} fill="rgba(249,247,242,0.5)" />
      </g>
    </Frame>
  );
}

export function IlMagicRewrite() {
  return (
    <Frame label="The Magic Rewrite bar rewrites the whole chapter from one instruction">
      <Card x={40} y={10} w={200} h={92} r={4} />
      <g className="ds-tut-anim-shimmer">
        <TextLines x={58} y={26} w={164} n={6} gap={12} />
      </g>
      <g>
        <rect x={30} y={114} width={162} height={26} rx={13} fill="#fff" stroke="rgba(193,122,71,0.5)" strokeWidth={1.4} />
        <text x={44} y={131} fontSize={10} fill="#F0A24B" fontFamily={SANS}>✦</text>
        <text x={58} y={130.5} fontSize={8.5} fontStyle="italic" fill="rgba(44,36,25,0.55)" fontFamily={SANS}>Make this chapter warmer…</text>
      </g>
      <Pill x={200} y={114} w={52} h={26} label="Rewrite" fs={9} className="ds-tut-anim-pulse" />
    </Frame>
  );
}

/* ── Export ─────────────────────────────────────────────────────────── */

export function IlExport() {
  return (
    <Frame label="Download your manuscript as PDF or DOCX, or send it to Google Drive">
      {[
        { x: 30, label: "PDF", color: ACCENT },
        { x: 110, label: "DOCX", color: "#5B8DBE" },
        { x: 190, label: "DRIVE", color: "#3E9E63" },
      ].map((c, i) => (
        <g key={c.label} className={i === 0 ? "ds-tut-anim-bob" : undefined}>
          <Card x={c.x} y={22} w={60} h={76} r={6} />
          <TextLines x={c.x + 10} y={34} w={40} n={4} gap={9} h={3} />
          <text x={c.x + 50} y={90} textAnchor="end" fontSize={8.5} fontWeight={700} fill={c.color} fontFamily={SANS}>{c.label}</text>
        </g>
      ))}
      <Pill x={30} y={112} w={60} h={20} label="↓ .pdf" fs={8.5} className="ds-tut-anim-pulse" />
      <Pill x={110} y={112} w={60} h={20} label="↓ .docx" fill="#5B8DBE" fs={8.5} />
      <Pill x={190} y={112} w={60} h={20} label="→ Drive" fill="#3E9E63" fs={8.5} />
    </Frame>
  );
}
