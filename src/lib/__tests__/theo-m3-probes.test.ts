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
const css = () => read("app/globals.css");
const uploadPage = () => read("app/(main)/project/[projectId]/upload/page.tsx");
const uploadEngine = () => read("app/(main)/project/[projectId]/upload/useUploadEngine.ts");
const intakeGrid = () => read("components/upload/IntakeGrid.tsx");

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

  it("keeps an iPhone dictation answer and its three-second auto-send across recognition restarts", () => {
    const src = chat();
    const recognition = src.slice(src.indexOf("const startRecognition"), src.indexOf("const toggleListening"));
    const onEnd = recognition.slice(recognition.indexOf("recognition.onend"), recognition.indexOf("recognitionRef.current = recognition"));
    const send = src.slice(src.indexOf("const sendMessage"), src.indexOf("// Keep autoSendRef"));
    expect(src).toMatch(/const finalTranscriptRef = useRef\(""\)/);
    expect(recognition).toMatch(/finalTranscriptRef\.current \+= transcript \+ " "/);
    expect(recognition).toMatch(/setInput\(finalTranscriptRef\.current \+ interim\)/);
    expect(recognition).toMatch(/setTimeout\(\(\) => \{[\s\S]{0,240}?autoSendRef\.current\?\.\(\)/);
    expect(onEnd).not.toMatch(/clearTimeout\(silenceTimerRef\.current\)/);
    expect(send).toMatch(/finalTranscriptRef\.current = ""/);
  });

  it("plays T.H.E.O. as inline media, not Web Audio, so iPhone uses its media channel", () => {
    const src = chat();
    const initialize = src.slice(src.indexOf("const initializeTtsAudio"), src.indexOf("// TTS helpers"));
    const playback = src.slice(src.indexOf("const playNext"), src.indexOf("const speakSentence"));
    expect(src).toMatch(/<audio ref=\{audioRef\} playsInline preload="auto"/);
    expect(initialize).toMatch(/audio\.playsInline = true/);
    expect(playback).toMatch(/audio\.play\(\)\.then/);
    expect(src).toMatch(/URL\.createObjectURL/);
    expect(src).not.toMatch(/new AudioContext|webkitAudioContext|decodeAudioData/);
  });

  it("only explains iPhone Silent mode after a successful media response begins", () => {
    const src = chat();
    const playback = src.slice(src.indexOf("const playNext"), src.indexOf("const speakSentence"));
    expect(playback).toMatch(/audio\.play\(\)\.then\(\(\) => \{[\s\S]{0,300}?Silent mode/);
    expect(src).toMatch(/const \[voiceNotice, setVoiceNotice\]/);
    expect(src).toMatch(/sendError \|\| storageBlocked \|\| voiceNotice/);
    expect(src).toMatch(/if \(audioQueueRef\.current\.length === 0\) \{ setSpeaking\(false\); return; \}/);
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
    expect(css()).toMatch(/\.ds-studio-shell-content[\s\S]*env\(safe-area-inset-top\)[\s\S]*env\(safe-area-inset-bottom\)/);
    expect(css()).toMatch(/\.ds-studio-header[\s\S]*safe-area-inset-top/);
  });
});

describe("T.H.E.O. M3: studio mobile surface", () => {
  it("resizes to the visual viewport so the composer stays above a soft keyboard", () => {
    const src = chat();
    expect(src).toMatch(/window\.visualViewport/);
    expect(src).toMatch(/visualViewport\?\.addEventListener\("resize", update\)/);
    expect(src).toMatch(/--ds-studio-viewport-height/);
    expect(read("app/layout.tsx")).toMatch(/interactiveWidget:\s*"resizes-content"/);
  });

  it("locks the studio surface and contains overscroll instead of refreshing the route", () => {
    const src = chat();
    expect(src).toMatch(/document\.body\.style\.overflow = "hidden"/);
    expect(css()).toMatch(/\.ds-studio-stage[\s\S]*overscroll-behavior: none/);
    expect(css()).toMatch(/\.ds-studio-conversation[\s\S]*overscroll-behavior: contain/);
  });

  it("uses a dialog with a focus trap and makes the covered lobby inert", () => {
    const src = chat();
    expect(src).toMatch(/aria-modal="true"/);
    expect(src).toMatch(/event\.key === "Escape"/);
    expect(src).toMatch(/event\.key !== "Tab"/);
    expect(uploadPage()).toMatch(/inert=\{chatting\}/);
  });

  it("adds a history entry so phone Back exits the studio before the upload route", () => {
    const src = uploadPage();
    expect(src).toMatch(/window\.history\.pushState\(studioState/);
    expect(src).toMatch(/window\.addEventListener\("popstate", onPopState\)/);
    expect(src).toMatch(/window\.history\.back\(\)/);
  });

  it("positions history within the flex content area rather than fixed header/footer pixels", () => {
    expect(chat()).toMatch(/className="ds-studio-content"[\s\S]*className="ds-studio-history"/);
    expect(css()).toMatch(/\.ds-studio-history\s*\{[\s\S]*inset: 0/);
    expect(chat()).not.toMatch(/top:\s*68/);
  });

  it("stacks Speak, the answer box, Send, and Finish on a phone", () => {
    const mobile = css().slice(css().indexOf("@media (max-width: 768px)", css().indexOf(".ds-studio-stage")));
    expect(mobile).toMatch(/\.ds-studio-composer-form\s*\{[\s\S]{0,180}?flex-direction:\s*column/);
    expect(mobile).toMatch(/\.ds-studio-mic,[\s\S]{0,120}?width:\s*100%/);
    expect(mobile).toMatch(/\.ds-studio-send\s*\{[\s\S]{0,100}?width:\s*100%/);
    expect(mobile).toMatch(/\.ds-studio-title\s*\{[\s\S]{0,180}?white-space:\s*normal/);
  });
});

describe("T.H.E.O. iPhone QA: no silent failures", () => {
  it("shows a recoverable voice failure instead of swallowing a failed TTS response", () => {
    const src = chat();
    const tts = src.slice(src.indexOf("const speakSentence"), src.indexOf("// Cleanup audio on unmount"));
    expect(tts).toMatch(/if \(!res\.ok\) \{\s*throw new Error\(`TTS request failed/);
    expect(tts).toMatch(/failedTtsTextRef\.current = next/);
    expect(tts).toContain("Try voice again");
    expect(src).toMatch(/const retryVoice = useCallback/);
  });

  it("keeps real brainstorm API errors instead of replacing them with a fake connection error", () => {
    const src = chat();
    expect(src).toMatch(/async function brainstormErrorMessage/);
    expect(src).toMatch(/payload\.message[\s\S]{0,150}?payload\.error/);
    expect(src).toMatch(/credentials:\s*"same-origin"/);
    expect(src).toMatch(/HTTP 401 — your sign-in has expired/);
    expect(src).toMatch(/setRetryAction\(\/HTTP 401\/\.test\(msg\) \? null/);
    expect(src).toMatch(/if \(!res\.body\) throw new Error\("T\.H\.E\.O\. returned no stream\."\)/);
    expect(src).toMatch(/T\.H\.E\.O\.'s service is temporarily unavailable/);
  });

  it("keeps finished recordings in the Record card while uploading them as sources", () => {
    const engine = uploadEngine();
    expect(engine).toMatch(/const \[recordings, setRecordings\] = useState<File\[\]>\(\[\]\)/);
    expect(engine).toMatch(/setRecordings\(\(prev\) => \[\.\.\.prev, file\]\)/);
    expect(engine).toMatch(/for \(const file of \[\.\.\.recordings, \.\.\.files\]\)/);
    expect(uploadPage()).toMatch(/recordings=\{engine\.recordings\}/);
    expect(intakeGrid()).toContain("RECORDED HERE · READY TO TRANSCRIBE");
  });

  it("pauses and resumes the live recorder instead of treating Pause as Stop", () => {
    const engine = uploadEngine();
    const tape = read("components/upload/CassetteTape.tsx");
    expect(engine).toMatch(/mediaRecorderRef\.current\.pause\(\)/);
    expect(engine).toMatch(/mediaRecorderRef\.current\.resume\(\)/);
    expect(engine).toMatch(/const \[isPaused, setIsPaused\] = useState\(false\)/);
    expect(tape).toMatch(/aria-label=\{isRecording \? "Pause recording" : isPaused \? "Resume recording" : "Record"\}/);
    expect(tape).not.toMatch(/transform:\s*scale\(0\.65\)/);
  });

  it("uses dynamic viewport height and respects the iPhone safe area for the app bar", () => {
    expect(read("app/(main)/layout.tsx")).toMatch(/min-height:\s*100dvh !important/);
    expect(read("app/(main)/layout.tsx")).not.toMatch(/min-height:\s*100vh !important/);
    expect(read("components/ui/OsBar.tsx")).toMatch(/top:\s*"max\(24px, env\(safe-area-inset-top\)\)"/);
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
