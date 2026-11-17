/**
 * T.H.E.O hero (PREVIEW, /hero-preview): copy, media and ribbon content in one
 * place so the owner's edits never touch the component.
 *
 * ── SWAP-IN POINT FOR THE NEW CLIP ─────────────────────────────────────────
 * THEO_HERO_MEDIA below is the ONLY thing to change when the "T.H.E.O clicks a
 * vintage recorder and opens a notebook" clip lands. Today it points at the
 * existing idle loop (the same alpha cutout the upload-page lobby uses), as a
 * stand-in.
 *
 * Recipe for a new clip (all local, ffmpeg + sharp, no credits):
 *   1. still = the clip's FIRST frame, alpha kept (libvpx decoder keeps alpha):
 *        ffmpeg -c:v libvpx-vp9 -i new-alpha.webm -frames:v 1 -pix_fmt rgba f0.png
 *      then sharp: f0.png -> webp q80 (816w) and webp q78 (480w).
 *      The still is the first paint and the LCP image, and the video crossfades
 *      in over it, so it must match frame 0 or the dissolve shows.
 *   2. phone cut, alpha kept:
 *        ffmpeg -c:v libvpx-vp9 -i new-alpha.webm -vf scale=480:-2 -c:v libvpx-vp9
 *          -pix_fmt yuva420p -crf 38 -b:v 0 -row-mt 1 -an -auto-alt-ref 0
 *          -metadata:s:v:0 alpha_mode=1 new-alpha-480.webm
 *   3. Safari / iPhone: no browser there composites VP9 alpha. To get motion on
 *      Apple devices the clip also needs an HEVC-with-alpha .mp4/.mov (hvc1),
 *      which has to be exported on a Mac (Compressor / Final Cut / avconvert);
 *      ffmpeg on Windows cannot write it. Put it in `hevcAlpha`. Until then
 *      Apple devices hold the still, which keeps the layering intact.
 */
export type TheoHeroMedia = {
  /** First paint + LCP image. Transparent webp, frame 0 of the clip. */
  still: { src: string; srcSmall: string; width: number; height: number };
  /** VP9 + alpha cutout for desktop Chrome / Edge / Firefox. */
  webm: string;
  /** Lighter VP9 + alpha cut for phones (<768px). Falls back to `webm`. */
  webmSmall?: string;
  /** HEVC-with-alpha (hvc1) for Safari / every iOS browser. null = still only. */
  hevcAlpha: string | null;
  /** true = seamless idle loop; false = play once and hold the last frame. */
  loop: boolean;
  /** Accessible name for the figure. */
  label: string;
};

export const THEO_HERO_MEDIA: TheoHeroMedia = {
  still: {
    src: "/theo-hero-still.webp", // frame 0 of theo-idle-alpha.webm
    srcSmall: "/theo-hero-still-480.webp",
    width: 816,
    height: 1104,
  },
  webm: "/theo-idle-alpha.webm", // STAND-IN: existing lobby idle loop (10s)
  webmSmall: "/theo-hero-idle-480.webm", // same loop, 480w, ~430 KB
  hevcAlpha: null,
  loop: true,
  label: "T.H.E.O, the D.scribe interviewer",
};

/** Placeholder copy. Change freely; nothing else reads these strings. */
export const THEO_HERO_COPY = {
  headlineLead: "Your voice.",
  headlineAccent: "Your book.",
  subhead: "Tell T.H.E.O your story out loud. D.scribe hands back a finished book, written in your voice.",
  // Same destination as the live hero's primary CTA ("HERE" pill) and the nav's Get Started.
  primaryCta: { label: "Get Started", href: "/login" },
  secondaryCta: { label: "See how it works", href: "#how-it-works" },
};

// Same six leather treatments as the dashboard library (Bookshelf.tsx COVERS)
// and the landing book carousel, so the ribbon reads as books off the same shelf.
const LEATHER = (hi: string, mid: string, lo: string) =>
  `radial-gradient(ellipse at 28% 18%, rgba(255,235,200,0.18) 0%, transparent 42%), linear-gradient(160deg, ${hi} 0%, ${mid} 45%, ${lo} 100%)`;
const TONES = {
  oxblood: LEATHER("#8A3A30", "#6E2A2A", "#3E1615"),
  forest: LEATHER("#2F5A46", "#244235", "#142720"),
  navy: LEATHER("#2E4A66", "#223449", "#121D2B"),
  saddle: LEATHER("#7A5030", "#5A3A22", "#31200F"),
  plum: LEATHER("#5E3A5E", "#4A2A47", "#2A1628"),
  olive: LEATHER("#5C5A38", "#4A4A2E", "#2A2A18"),
} as const;

export type RibbonItem =
  | { kind: "cover"; title: string; kicker: string; cover: string }
  | { kind: "page"; chapter: string; firstLine: string };

/**
 * Sample covers and chapter pages. Generic sample titles only: no author names,
 * no customers, no testimonials. Kinds cover the four buyers on the site
 * (memoir, sermon series, podcast-to-book, founder talks).
 */
export const RIBBON_ITEMS: RibbonItem[] = [
  { kind: "cover", title: "The Kitchen Table Years", kicker: "Memoir", cover: TONES.oxblood },
  { kind: "page", chapter: "Chapter One", firstLine: "It started as a voice memo in the car." },
  { kind: "cover", title: "Twelve Sundays in Romans", kicker: "Sermon series", cover: TONES.forest },
  { kind: "cover", title: "Notes From the Mic", kicker: "Podcast to book", cover: TONES.navy },
  { kind: "page", chapter: "Chapter Four", firstLine: "Nobody tells you what the second year costs." },
  { kind: "cover", title: "Built in a Borrowed Garage", kicker: "Founder talks", cover: TONES.saddle },
  { kind: "cover", title: "What My Father Kept", kicker: "Memoir", cover: TONES.plum },
  { kind: "page", chapter: "Chapter Seven", firstLine: "The sermon I almost didn’t preach." },
  { kind: "cover", title: "Grace for the Commute", kicker: "Sermon series", cover: TONES.olive },
  { kind: "cover", title: "Season One, Bound", kicker: "Podcast to book", cover: TONES.oxblood },
  { kind: "page", chapter: "Chapter Two", firstLine: "We said yes before we had a plan." },
  { kind: "cover", title: "The Second Location", kicker: "Founder talks", cover: TONES.forest },
  { kind: "cover", title: "Letters to My Grandkids", kicker: "Memoir", cover: TONES.navy },
];
