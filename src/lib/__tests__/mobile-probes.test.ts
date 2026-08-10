/**
 * MOBILE EDGE PROBES — responsive-web behaviour. Loop 1, 2026-08-02.
 *
 *   it()       — behaviour is already correct, this locks it in.
 *   it.fails() — KNOWN DEFECT. The assertion is what SHOULD be true; vitest
 *                expects the failure so CI stays green. Fix the bug and this
 *                probe turns RED — that is the cue to promote it to it().
 *
 * These assert against source text rather than a rendered DOM, because the
 * defects live in the viewport export and the stylesheet, not in component logic.
 *
 * Findings write-up: C:\Answer\projects\dscribe-mobile-edge-test-2026-08-02.md
 */

import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

const SRC = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

const layout = () => read("app/layout.tsx");
const globalsCss = () => read("app/globals.css");
const pageShell = () => read("components/ui/PageShell.tsx");

/** The @media (max-width: 768px) block — where mobile layout actually lives. */
function mobileBlock(): string {
  const css = globalsCss();
  const start = css.indexOf("@media (max-width: 768px)", css.indexOf("Global Mobile Responsive"));
  return start === -1 ? "" : css.slice(start, start + 4000);
}

describe("mobile: files are where the probes think they are", () => {
  it("reads layout, globals.css and PageShell", () => {
    expect(layout()).toContain("export const viewport");
    expect(globalsCss()).toContain("Global Mobile Responsive");
    expect(pageShell()).toContain("Step navigation");
    expect(mobileBlock().length).toBeGreaterThan(500);
  });
});

describe("mobile: viewport policy", () => {
  it("sets width=device-width and initial-scale 1", () => {
    expect(layout()).toMatch(/width:\s*["']device-width["']/);
    expect(layout()).toMatch(/initialScale:\s*1/);
  });

  // DEFECT M1 — maximumScale: 1 blocks pinch-zoom. WCAG 2.1 AA SC 1.4.4 requires
  // text to scale to 200%. This is a manuscript reader/editor whose stated ICP
  // skews older. The usual motive (stop iOS zoom-on-input-focus) is better fixed
  // with font-size:16px on inputs.
  it("does not disable pinch-zoom", () => {
    expect(layout()).not.toMatch(/maximumScale/);
  });

  // DEFECT M3b — without viewportFit: "cover", env(safe-area-inset-*) resolves to
  // 0, so notch/home-indicator padding cannot work even once it is added.
  it("opts into the display cutout so safe-area insets resolve", () => {
    expect(layout()).toMatch(/viewportFit:\s*["']cover["']/);
  });
});

describe("mobile: viewport units", () => {
  it("desktop shells already use the dynamic viewport unit", () => {
    const css = globalsCss();
    expect(css).toMatch(/\.ds-page-shell\s*\{[^}]*100dvh/);
    expect(css).toMatch(/\.ds-main-layout\s*\{[^}]*100dvh/);
  });

  // DEFECT M2 — the mobile block uses 100vh, which on iOS Safari is the LARGEST
  // viewport height (address bar retracted). Every such container renders ~60-100px
  // taller than the visible area, producing phantom scroll on load. dvh is exactly
  // the fix, and the desktop rules above already use it.
  it("mobile block uses dvh, not the legacy vh", () => {
    expect(mobileBlock()).not.toMatch(/\d+vh/);
  });
});

describe("mobile: safe area and the fixed footer nav", () => {
  it("the step nav is pinned to the bottom edge", () => {
    expect(pageShell()).toMatch(/position:\s*["']fixed["']/);
    expect(pageShell()).toMatch(/bottom:\s*0/);
  });

  // DEFECT M3 — safe-area-inset appears ZERO times in the whole of src/. A bar
  // bottomed at 0 with no inset padding sits inside the iPhone home-indicator
  // strip, and those are the Prev/Next controls the whole pipeline depends on.
  it("the fixed bottom nav pads for the home indicator", () => {
    expect(pageShell()).toMatch(/safe-area-inset-bottom/);
  });

  it("safe-area insets are used somewhere in the app", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d)) {
        const p = path.join(d, e);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx|css)$/.test(e)) files.push(p);
      }
    };
    walk(SRC);
    expect(files.some((f) => fs.readFileSync(f, "utf8").includes("safe-area-inset"))).toBe(true);
  });
});

/** Every .tsx under src/, as [relativePath, source]. */
function tsxFiles(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d)) {
      const p = path.join(d, e);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (e.endsWith(".tsx")) out.push([path.relative(SRC, p).replace(/\\/g, "/"), fs.readFileSync(p, "utf8")]);
    }
  };
  walk(SRC);
  return out;
}

describe("mobile: pointer interaction must not be mouse-only", () => {
  it("finds the component tree", () => {
    expect(tsxFiles().length).toBeGreaterThan(20);
  });

  // DEFECT M10 — drag sequences built on mousemove/mouseup DO NOT WORK on touch.
  // Browsers synthesize mouse events for simple taps, never for touch drags — a
  // finger drag emits touchmove and the browser scrolls instead. OutlineEditor
  // uses this to drag-reorder chapters (REORDER_CHAPTERS), so chapter reordering
  // is unreachable on a phone. Pointer Events cover mouse, touch and pen.
  it("no component drives drag from mousemove/mouseup", () => {
    const offenders = tsxFiles()
      .filter(([, src]) => /addEventListener\(\s*"(mousemove|mouseup)"/.test(src))
      .map(([f]) => f);
    expect(offenders).toEqual([]);
  });

  // DEFECT M11 — outside-click dismissal bound to mousedown. Synthesised mouse
  // events on touch are unreliable (delayed, and suppressed when the tap becomes
  // a scroll or gesture), so these overlays can fail to dismiss on a phone.
  it("no overlay dismisses via a mousedown-only outside handler", () => {
    const offenders = tsxFiles()
      .filter(([, src]) => /addEventListener\(\s*"mousedown"/.test(src))
      .map(([f]) => f);
    expect(offenders).toEqual([]);
  });
});

describe("mobile: payload", () => {
  // DEFECT M8 — three.js is imported STATICALLY into the analysis page, and as a
  // namespace import (`import * as THREE`) which defeats tree-shaking. It powers a
  // decorative WebGL background on a LOADING screen, so the cost lands on the
  // exact screen the user is already waiting on. The same page file already uses
  // dynamic(..., { ssr: false }) for OutlineEditor two lines later.
  it("the three.js loading screen is code-split out of the page bundle", () => {
    const page = read("app/(main)/project/[projectId]/analysis/page.tsx");
    const staticImport = /^import AnalysisLoadingScreen from/m.test(page);
    expect(staticImport).toBe(false);
  });

  it("the three.js component itself is written correctly", () => {
    // Credit where due: reduced-motion respected, full GPU cleanup on unmount.
    const c = read("components/analysis/AnalysisLoadingScreen.tsx");
    expect(c).toMatch(/prefers-reduced-motion/);
    expect(c).toMatch(/geometry\.dispose\(\)/);
    expect(c).toMatch(/material\.dispose\(\)/);
    expect(c).toMatch(/renderer\.dispose\(\)/);
    expect(c).toMatch(/cancelAnimationFrame/);
  });
});

describe("mobile: overlay positioning within a narrow viewport", () => {
  // DEFECT M12 — the Magic Edit bubble is positioned straight from selection
  // coordinates with no clamp:
  //   top:  coords.top  - editorRect.top - 48
  //   left: coords.left - editorRect.left
  // No Math.min/Math.max, no width measurement, no viewport bounds. On a 375px
  // phone a selection near the right edge renders the bubble off-screen, and a
  // selection on the first line gives a negative top.
  it("clamps the Magic Edit bubble inside the viewport", () => {
    const src = read("components/editor/MagicEditBubble.tsx");
    const block = /setPosition\(\{[\s\S]{0,220}?\}\)/.exec(src)?.[0] ?? "";
    expect(block).toMatch(/Math\.(min|max)/);
  });
});

describe("mobile: the upload journey (the core mobile use case)", () => {
  const engine = () => read("app/(main)/project/[projectId]/upload/useUploadEngine.ts");

  it("uploads straight to R2 with a presigned PUT", () => {
    // The PUT now rides XMLHttpRequest (for upload progress) instead of fetch.
    expect(engine()).toMatch(/xhr\.open\(\s*["']PUT["']/);
    expect(engine()).toMatch(/audio\/upload-url/);
  });

  it("the file input accepts both MIME wildcards and extensions", () => {
    // Correct defence against inconsistent mobile MIME reporting.
    // 2026-08-09: the file input moved from RightPanel to IntakeGrid in the intake recomposition.
    const accept = /accept="([^"]+)"/.exec(read("components/upload/IntakeGrid.tsx"))?.[1] ?? "";
    expect(accept).toContain("audio/*");
    expect(accept).toContain(".m4a");
  });

  // DEFECT M15 — the PUT uses fetch(), which CANNOT report upload progress; only
  // XMLHttpRequest exposes xhr.upload.onprogress. A 30-90 minute talk recording
  // over cellular is minutes of a screen that says "uploading" and never moves.
  it("reports upload progress during the transfer", () => {
    expect(engine()).toMatch(/upload\.onprogress|XMLHttpRequest|onUploadProgress/);
  });

  // DEFECT M16 — no AbortController, no timeout, no retry, no chunking. A mobile
  // network drop (tower handoff, tunnel, wifi-to-cellular) fails the whole file
  // and restarts it at byte 0. On mobile that is the expected case, not the edge.
  it("can abort or retry a failed upload", () => {
    expect(engine()).toMatch(/AbortController|retry|maxAttempts/i);
  });

  // The YouTube path DOES surface server errors — proof the pattern is known.
  it("the YouTube path shows the server's error text", () => {
    expect(engine()).toMatch(/setYoutubeError\(err\.error/);
  });

  // DEFECT M19 — the FILE path does not. Same hook, same server, two behaviours:
  // youtube gets setYoutubeError(err.error || ...), file upload gets
  // console.error() and a bare "failed" chip. There is no uploadError state at
  // all. The server sends "File too large. Maximum size is 500 MB (received
  // 812.3 MB)" and the client throws it away — and phones have no console.
  it("the file-upload path also surfaces the server's error text", () => {
    const src = engine();
    expect(src).toMatch(/setUploadError|uploadError/);
  });
});

describe("mobile: in-browser recording on iOS", () => {
  const engine = () => read("app/(main)/project/[projectId]/upload/useUploadEngine.ts");

  it("a real MediaRecorder flow exists", () => {
    expect(engine()).toMatch(/navigator\.mediaDevices\.getUserMedia/);
    expect(engine()).toMatch(/new MediaRecorder\(/);
  });

  // DEFECT M17 — BOTH branches of the mimeType ternary are webm:
  //   isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm"
  // iOS Safari's MediaRecorder supports NEITHER; it records audio/mp4. So on every
  // iPhone and iPad the constructor throws NotSupportedError, the catch logs
  // "Microphone access denied", and the user sees the mic prompt succeed and then
  // nothing at all. Recording is dead on iOS with no error shown.
  // FIXED (M17): the recorder now picks the first supported entry from a
  // candidate list that leads with audio/mp4 — the container iOS Safari
  // actually records — instead of a webm-only ternary that left the record
  // button silently dead on every iPhone.
  it("falls back to a format iOS Safari can actually record", () => {
    const src = engine();
    expect(src).toMatch(/RECORDER_MIME_CANDIDATES[\s\S]{0,200}audio\/mp4/);
    expect(src).toMatch(/RECORDER_MIME_CANDIDATES\.find\(\(c\) => MediaRecorder\.isTypeSupported\(c\)\)/);
  });

  // DEFECT M18 — getUserMedia succeeds and assigns streamRef BEFORE the
  // MediaRecorder constructor can throw. The catch only console.errors; it never
  // stops the tracks. The mic stays open, so the phone keeps showing its
  // recording indicator while nothing is being recorded.
  // FIXED (M18): every recorder failure path calls releaseMicrophone(), which
  // stops all tracks — the phone no longer shows a live mic indicator while
  // recording nothing.
  it("releases the microphone when recorder setup fails", () => {
    const src = engine();
    expect(src).toMatch(/releaseMicrophone[\s\S]{0,300}getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/);
    expect(src).toMatch(/catch \(err\) \{[\s\S]{0,400}?releaseMicrophone\(\)/);
  });
});

describe("mobile: iOS focus-zoom, the reason M1 exists", () => {
  // DEFECT M24 — iOS Safari zooms the viewport when a focused input's font-size
  // is under 16px. The login email input is 15px (login/page.tsx:152), so iOS
  // zooms on focus, and suppressing that is almost certainly why
  // `maximumScale: 1` was added to the viewport — which then breaks pinch-zoom
  // for every user (M1 / WCAG 1.4.4).
  //
  // ORDER OF OPERATIONS: bump the input to 16px FIRST, then remove maximumScale.
  // Removing maximumScale alone reintroduces the focus-zoom and someone reverts it.
  it("the login email input is at least 16px so iOS will not focus-zoom", () => {
    const src = read("app/login/page.tsx");
    // NB: cannot match to the tag's closing '>' — arrow functions in onChange
    // contain '>' and truncate the match. Use a fixed window instead.
    const win = src.slice(src.indexOf("<input"), src.indexOf("<input") + 1400);
    const size = Number(/fontSize:\s*(\d+)/.exec(win)?.[1] ?? 0);
    expect(size).toBeGreaterThanOrEqual(16);
  });

  // DEFECT M27 — this is systemic, not one file. 12 of 13 text-entry fields in
  // the app are under 16px, from an 11px project-title input upward. Only
  // BrainstormChat's textarea (16px) is safe.
  // FIXED (M27): every explicit sub-16px text field was bumped to 16 so iOS
  // stops focus-zooming. The scan window now ends at the tag's own "/>" —
  // the old fixed 1400-char window read PAST the tag and attributed the next
  // element's font size (a hint paragraph, a button) to the input.
  it("every text-entry field is at least 16px", () => {
    const TWPX: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20 };
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d)) {
        const p = path.join(d, e);
        if (fs.statSync(p).isDirectory()) { walk(p); continue; }
        if (!e.endsWith(".tsx")) continue;
        const src = fs.readFileSync(p, "utf8");
        const re = /<(input|textarea)\b/g;
        let m;
        while ((m = re.exec(src))) {
          const rawWin = src.slice(m.index, m.index + 1400);
          const tagEnd = rawWin.indexOf("/>");
          const win = tagEnd === -1 ? rawWin : rawWin.slice(0, tagEnd);
          const type = m[1] === "textarea" ? "textarea" : (/type\s*=\s*["']?(\w+)/.exec(win)?.[1] ?? "text");
          if (["checkbox", "radio", "file", "range", "hidden", "submit", "button"].includes(type)) continue;
          const inline = /fontSize:\s*(\d+(?:\.\d+)?)/.exec(win);
          const px = /text-\[(\d+(?:\.\d+)?)px\]/.exec(win);
          const tw = /\btext-(xs|sm|base|lg|xl)\b/.exec(win);
          const size = inline ? Number(inline[1]) : px ? Number(px[1]) : tw ? TWPX[tw[1]] : null;
          if (size !== null && size < 16) {
            offenders.push(`${path.relative(SRC, p).replace(/\\/g, "/")}:${src.slice(0, m.index).split("\n").length} (${size}px)`);
          }
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});

describe("mobile: touch targets", () => {
  // DEFECT M4 — 13px text + 8px vertical padding is roughly a 32px tall target on
  // the app's most-pressed control. Apple HIG wants 44pt, Material 48dp. Clears
  // WCAG 2.5.8's 24px floor, so it is a guideline miss rather than a failure.
  it("step-nav links meet the 44px touch-target guideline", () => {
    const rule = /nav\[aria-label="Step navigation"\] a \{([^}]*)\}/.exec(globalsCss())?.[1] ?? "";
    const padY = Number(/padding:\s*(\d+)px/.exec(rule)?.[1] ?? 0);
    const fontPx = Number(/font-size:\s*(\d+)px/.exec(rule)?.[1] ?? 0);
    expect(padY * 2 + fontPx * 1.2).toBeGreaterThanOrEqual(44);
  });
});
