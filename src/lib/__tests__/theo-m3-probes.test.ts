/**
 * T.H.E.O. M3 EDGE PROBES — 2026-08-12
 *
 * Source-level probes for the lobby/studio campaign. `it.fails()` marks a
 * deferred product gap: it passes while the expected assertion fails, then
 * turns red when someone partially implements the promise.
 */

import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");
const chat = () => read("components/upload/BrainstormChat.tsx");

describe("T.H.E.O. M3: interruption and returning-user recovery", () => {
  it("persists an unsent draft with messages and still reads legacy array sessions", () => {
    const src = chat();
    expect(src).toMatch(/function parseSavedSession/);
    expect(src).toMatch(/if \(Array\.isArray\(parsed\)\)/);
    expect(src).toMatch(/draft:\s*draftRef\.current/);
    expect(src).toMatch(/saved\.messages\.length >= 2 \|\| !!saved\.draft\.trim\(\)/);
    expect(src).toMatch(/setInput\(savedDraft\)/);
  });

  it("cannot recreate a finished session from a stale autosave timer", () => {
    const src = chat();
    const finish = src.slice(src.indexOf("const finishBrainstorm"), src.indexOf("const undoLast"));
    expect(finish).toMatch(/clearTimeout\(maxWaitRef\.current\)/);
    expect(finish).toMatch(/try \{ localStorage\.removeItem\(sessionKey\); \} catch/);
    expect(src).toMatch(/useEffect\(\(\) => \(\) => \{\s*if \(maxWaitRef\.current\) clearTimeout/m);
  });

  it("flushes the latest session once on unmount without recreating a completed one", () => {
    const src = chat();
    expect(src).toMatch(/persistSessionOnUnmountRef\.current && startedRef\.current/);
    expect(src).toMatch(/localStorage\.setItem\(sessionKey, JSON\.stringify\(\{/);
    expect(src).toMatch(/persistSessionOnUnmountRef\.current = false/);
  });

  it("rolls back a failed opening stream and routes Retry to a new opening request", () => {
    const src = chat();
    const start = src.slice(src.indexOf("const startConversation"), src.indexOf("const sendMessage"));
    expect(start).toMatch(/let streamFailed = false/);
    expect(start).toMatch(/streamFailed = true;[\s\S]{0,180}?setMessages\(\[\]\)/);
    expect(start).toMatch(/setRetryAction\("start"\)/);
    expect(start).toMatch(/if \(!streamFailed && sentenceBufferRef\.current\.trim\(\)\)/);
    expect(src).toMatch(/if \(action === "start"\) startConversation\(\)/);
  });

  it("surfaces a failed Finish and retries the summarize request rather than sending an empty turn", () => {
    const src = chat();
    const finish = src.slice(src.indexOf("const finishBrainstorm"), src.indexOf("const undoLast"));
    expect(finish).toMatch(/setSendError\(err\.message \|\| "Couldn't add this session/);
    expect(finish).toMatch(/setRetryAction\("finish"\)/);
    expect(src).toMatch(/else if \(action === "finish"\) finishBrainstorm\(\)/);
  });

  it("stops background voice activity rather than capturing after an interruption", () => {
    const src = chat();
    expect(src).toMatch(/document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
    expect(src).toMatch(/setHandsFree\(false\)/);
    expect(src).toMatch(/stopAudio\(\)/);
    expect(src).toMatch(/if \(!pageVisibleRef\.current\) return;/);
    expect(src).toMatch(/if \(!pageVisibleRef\.current \|\| !ttsEnabledRef\.current/);
  });

  it("serializes TTS sentence requests so later audio cannot overtake earlier audio", () => {
    const src = chat();
    expect(src).toMatch(/const ttsRequestQueueRef = useRef<string\[\]>\(\[\]\)/);
    expect(src).toMatch(/const ttsRequestInFlightRef = useRef\(false\)/);
    expect(src).toMatch(/ttsRequestQueueRef\.current\.push\(text\)/);
    expect(src).toMatch(/if \(ttsRequestInFlightRef\.current\) return/);
    expect(src).toMatch(/const next = ttsRequestQueueRef\.current\.shift\(\)/);
  });
});

describe("T.H.E.O. M3: small-screen lobby density", () => {
  it("reduces the oversized lobby CTA and keeps its panel inside the dynamic viewport", () => {
    const src = read("components/upload/MeetTheoPanel.tsx");
    const mobile = src.slice(src.indexOf("@media (max-width: 900px)"), src.indexOf("`}</style>"));
    expect(mobile).toMatch(/max-height:\s*calc\(100dvh - 24px\)/);
    expect(mobile).toMatch(/\.theo-lobby-cta \{ padding: 18px 24px !important; font-size: 18px !important; \}/);
    expect(mobile).toMatch(/\.theo-lobby-panel h2 \{ font-size: clamp\(1\.65rem, 8vw, 2\.2rem\) !important; \}/);
  });

  it("keeps studio prompts clear of display cutouts and releases horizontal space", () => {
    expect(chat()).toMatch(/padding: "env\(safe-area-inset-top\) clamp\(16px, 5vw, 48px\) env\(safe-area-inset-bottom\)"/);
  });
});

describe("T.H.E.O. M3: offline product promise", () => {
  // DEFECT M3-04 — there is no manifest or service-worker registration. The
  // studio only appears to be an installable/offline app because it is a mobile
  // full-screen surface; in reality an offline launch cannot load it or queue
  // a memoir answer. This needs an explicit product decision on offline scope,
  // cache retention, and conflict handling before implementation.
  it.fails("declares an installable manifest and registers an offline worker", () => {
    const layout = read("app/layout.tsx");
    const appSources = [
      read("components/upload/BrainstormChat.tsx"),
      read("app/(main)/project/[projectId]/upload/page.tsx"),
    ].join("\n");
    expect(layout).toMatch(/manifest\s*:/);
    expect(appSources).toMatch(/navigator\.serviceWorker\.register/);
  });
});
