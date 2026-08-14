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
    // Backgrounding must actually release the hardware: teardown stops every
    // track, and returning requires an explicit Speak tap.
    const teardown = src.slice(src.indexOf("const teardownMic"), src.indexOf("const disarmHandsFree"));
    expect(teardown).toMatch(/getTracks\(\)\.forEach\(\(track\) => \{[\s\S]{0,80}?track\.stop\(\)/);
    const visibility = src.slice(src.indexOf("const onVisibilityChange"), src.indexOf("// Clean up capture on unmount"));
    expect(visibility).toMatch(/teardownMic\(\)/);
  });

  it("streams live words while speaking and falls back to the recorded clip if the socket dies", () => {
    const src = chat();
    // Live display comes from Deepgram's streaming endpoint, authorized with a
    // short-lived server-minted token — never the real key in the browser.
    expect(src).toMatch(/wss:\/\/api\.deepgram\.com\/v1\/listen/);
    expect(src).toMatch(/interim_results=true/);
    expect(src).toMatch(/new WebSocket\(LIVE_STT_URL, \["bearer", token\]\)/);
    expect(src).not.toMatch(/DEEPGRAM_API_KEY/);
    // Words spoken during the handshake are queued, not lost.
    expect(src).toMatch(/pcmQueueRef\.current;[\s\S]{0,80}?queue\.push\(chunk\)/);
    // The live socket is display sugar: on any failure the recorded clip still
    // delivers the whole turn through the batch route.
    expect(src).toMatch(/liveStateRef\.current = "failed"/);
    expect(src).toMatch(/if \(liveStateRef\.current === "open"\)/);
    expect(src).toMatch(/endSegment\("send"\)/);
    // Typing still always beats dictation, live or batch.
    const live = src.slice(src.indexOf("const openLiveSocket"), src.indexOf("const transcribeSegment"));
    expect(live).toMatch(/if \(typedRef\.current\) return;/);
    const tokenRoute = read("app/api/brainstorm/stt-token/route.ts");
    expect(tokenRoute).toMatch(/requireAuth\(\)/);
    expect(tokenRoute).toMatch(/checkRateLimit\(user\.id, "brainstorm-stt-token"/);
    expect(tokenRoute).toMatch(/auth\/grant/);
    expect(tokenRoute).toMatch(/ttl_seconds: 30/);
  });

  it("transcribes hands-free answers server-side with Deepgram, authenticated and rate-limited", () => {
    const route = read("app/api/brainstorm/stt/route.ts");
    expect(route).toMatch(/requireAuth\(\)/);
    expect(route).toMatch(/checkRateLimit\(user\.id, "brainstorm-stt"/);
    expect(route).toMatch(/contentType\.startsWith\("audio\/"\)/);
    expect(route).toMatch(/MAX_AUDIO_BYTES/);
    expect(route).toMatch(/transcribeUtterance\(audio, contentType\)/);
    const dg = read("lib/deepgram.ts");
    expect(dg).toMatch(/export async function transcribeUtterance/);
    expect(dg).toMatch(/mip_opt_out: true/);
  });

  it("serializes TTS sentence requests so later audio cannot overtake earlier audio", () => {
    const src = chat();
    expect(src).toMatch(/const ttsRequestQueueRef = useRef<string\[\]>\(\[\]\)/);
    expect(src).toMatch(/const ttsRequestInFlightRef = useRef\(false\)/);
    expect(src).toMatch(/ttsRequestQueueRef\.current\.push\(text\)/);
    expect(src).toMatch(/if \(ttsRequestInFlightRef\.current\) return/);
    expect(src).toMatch(/const next = ttsRequestQueueRef\.current\.shift\(\)/);
  });

  it("keeps the three-second quiet auto-send and lands the transcript in the composer", () => {
    const src = chat();
    // Kyle's 3s quiet-send is a hard product requirement; the constant is the
    // single authority and the meter loop is its only consumer.
    expect(src).toMatch(/const QUIET_SEND_MS = 3000/);
    expect(src).toMatch(/now - lastVoiceAtRef\.current >= QUIET_SEND_MS/);
    // Transcript lands in the composer, then auto-sends without a second tap.
    expect(src).toMatch(/setInput\(transcript\)/);
    expect(src).toMatch(/autoSendRef\.current\?\.\(transcript\)/);
    // The override exists so the send cannot race the composer's render.
    expect(src).toMatch(/const sendMessage = useCallback\(async \(textOverride\?: string\)/);
    // A typed answer always beats a returning transcript.
    expect(src).toMatch(/if \(typedRef\.current\) return;/);
  });

  it("creates one inline media element and unlocks it during the voice-choice tap", () => {
    const src = chat();
    const initialize = src.slice(src.indexOf("const initializeTtsAudio"), src.indexOf("// TTS helpers"));
    const playback = src.slice(src.indexOf("const playNext"), src.indexOf("const speakSentence"));
    expect(initialize.match(/new Audio\(\)/g)).toHaveLength(1);
    expect(initialize).toMatch(/const audio = audioRef\.current \?\? new Audio\(\)/);
    expect(initialize).toMatch(/audioRef\.current = audio/);
    expect(initialize).toMatch(/audio\.setAttribute\("playsinline", ""\)/);
    expect(initialize).toMatch(/audio\.src = TTS_UNLOCK_AUDIO/);
    expect(initialize).toMatch(/ttsUnlockReadyRef\.current = audio\.play\(\)\.then/);
    expect(initialize).toMatch(/audio\.src !== TTS_UNLOCK_AUDIO\) return;[\s\S]{0,120}?audio\.pause\(\)/);
    expect(initialize).not.toMatch(/audio\.removeAttribute\("src"\)|audio\.load\(\)/);
    expect(playback).toMatch(/audio\.play\(\)\.then/);
    expect(src).toMatch(/URL\.createObjectURL/);
    // Playback must stay on the HTML media element (iPhone routes Web Audio
    // behind the ringer path). The hands-free ANALYSER may use an
    // AudioContext, but the TTS pipeline itself must never decode or play
    // through one.
    const voicePipeline = src.slice(src.indexOf("const playNext"), src.indexOf("const retryVoice"));
    expect(voicePipeline).not.toMatch(/AudioContext|decodeAudioData/);
    expect(src).not.toMatch(/decodeAudioData/);
  });

  it("only explains iPhone Silent mode after a successful media response begins", () => {
    const src = chat();
    const playback = src.slice(src.indexOf("const playNext"), src.indexOf("const speakSentence"));
    expect(playback).toMatch(/audio\.play\(\)\.then\(\(\) => \{[\s\S]{0,500}?Silent mode/);
    expect(src).toMatch(/const \[voiceNotice, setVoiceNotice\]/);
    expect(src).toMatch(/sendError \|\| storageBlocked \|\| voiceNotice/);
    expect(src).toMatch(/if \(audioQueueRef\.current\.length === 0\) \{[\s\S]{0,160}?setSpeaking\(false\);[\s\S]{0,40}?return;/);
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
  it("uses the already-unlocked media element for every queued sentence", () => {
    const src = chat();
    const playback = src.slice(src.indexOf("const playNext"), src.indexOf("const speakSentence"));
    const tts = src.slice(src.indexOf("const speakSentence"), src.indexOf("// Cleanup audio on unmount"));
    expect(playback).toMatch(/const audio = audioRef\.current/);
    expect(playback).toMatch(/if \(ttsUnlockPendingRef\.current\) \{\s*void ttsUnlockReadyRef\.current\?\.finally\(\(\) => playNext\(\)\)/);
    expect(playback).toMatch(/const nextAudio = audioQueueRef\.current\.shift\(\)!/);
    expect(playback).toMatch(/audio\.onended = finishPlayback/);
    expect(playback).toMatch(/audio\.src = url/);
    expect(playback).toMatch(/audio\.onended = null;[\s\S]{0,500}?playNext\(\)/);
    expect(playback).not.toMatch(/audio\.removeAttribute\("src"\)|audio\.load\(\)/);
    const finish = playback.slice(playback.indexOf("const finishPlayback"), playback.indexOf("const playbackFailed"));
    expect(finish).not.toMatch(/audio\.pause\(\)|audio\.removeAttribute\("src"\)|audio\.load\(\)/);
    const hardStop = src.slice(src.indexOf("const stopAudio"), src.indexOf("const releaseAudioForRecognition"));
    expect(hardStop).toMatch(/audio\.removeAttribute\("src"\);\s*audio\.load\(\)/);
    expect(tts).toMatch(/audioQueueRef\.current\.push\(\{\s*url: URL\.createObjectURL[\s\S]*text: next/);
    expect(tts).toMatch(/playNext\(\)/);
  });

  it("keeps the speaker enabled when a later play is blocked and offers a real retry tap", () => {
    const src = chat();
    const playback = src.slice(src.indexOf("const playNext"), src.indexOf("const speakSentence"));
    const playbackFailed = playback.slice(playback.indexOf("const playbackFailed"), playback.indexOf("audio.src = url"));
    expect(playback).toMatch(/\.catch\(\(\) => \{\s*if \(isCurrentPlayback\(\)\) \{\s*playbackFailed\("iPhone blocked/);
    expect(playbackFailed).not.toMatch(/ttsEnabledRef\.current = false|setTtsEnabled\(false\)/);
    expect(playbackFailed).toMatch(/failedTtsTextRef\.current = text/);
    expect(playbackFailed).toContain("Try voice again");
    expect(src).toMatch(/onClick=\{retryVoice\}/);
  });

  it("holds one microphone stream through T.H.E.O.'s playback and gates recording only in software", () => {
    const src = chat();
    const playback = src.slice(src.indexOf("const playNext"), src.indexOf("const speakSentence"));
    const tick = src.slice(src.indexOf("const vadTick"), src.indexOf("const startHandsFree"));
    const start = src.slice(src.indexOf("const startHandsFree"), src.indexOf("const toggleListening"));

    // Web Speech is gone from this path: seven live rounds (#18–#24) proved it
    // cannot share the iOS audio session with the TTS element.
    expect(src).not.toMatch(/new SpeechRecognition|webkitSpeechRecognition/);
    // One getUserMedia per Speak tap, requested inside the gesture.
    expect(start.match(/navigator\.mediaDevices\.getUserMedia\(\{/g)).toHaveLength(1);
    expect(start).toMatch(/echoCancellation: true/);
    // The TTS pipeline must never touch the capture stream — stopping or
    // re-requesting it is exactly what iOS punishes.
    expect(playback).not.toMatch(/getUserMedia|getTracks|MediaRecorder|teardownMic/);
    // The software gate covers streaming, synthesis in flight, queued clips,
    // and live playback; only RECORDING is gated, never the stream.
    expect(tick).toMatch(/!isPlayingRef\.current && !speakingRef\.current && !streamingRef\.current/);
    expect(tick).toMatch(/ttsRequestQueueRef\.current\.length === 0/);
    expect(tick).toMatch(/audioQueueRef\.current\.length === 0/);
    expect(tick).toMatch(/endSegment\("discard"\)/);
    // A mic that cannot start or capture must fail loudly, not silently.
    expect(start).toMatch(/Hands-free could not open the microphone/);
    expect(tick).toMatch(/gave the microphone back muted/);
    expect(src).toMatch(/const MUTED_MIC_GRACE_MS = 1500/);
  });

  it("keeps a finished blob live until the next clip replaces audio.src", () => {
    const playback = chat().slice(chat().indexOf("const playNext"), chat().indexOf("const speakSentence"));
    const finish = playback.slice(playback.indexOf("const finishPlayback"), playback.indexOf("const playbackFailed"));
    const assignNext = playback.slice(playback.indexOf("audio.src = url"), playback.indexOf("isPlayingRef.current = true"));
    expect(finish).not.toMatch(/URL\.revokeObjectURL|currentAudioUrlRef\.current = null/);
    expect(finish).not.toMatch(/audio\.pause\(\)|audio\.load\(\)|audio\.removeAttribute\("src"\)/);
    expect(finish).toMatch(/playNext\(\)/);
    expect(assignNext).toMatch(
      /audio\.src = url;[\s\S]{0,260}?URL\.revokeObjectURL\(previousAudioUrl\)[\s\S]{0,120}?currentAudioUrlRef\.current = url/,
    );
  });

  it("ignores stale audio and capture callbacks instead of clobbering a new turn", () => {
    const src = chat();
    const playback = src.slice(src.indexOf("const playNext"), src.indexOf("const speakSentence"));
    const segment = src.slice(src.indexOf("const beginSegment"), src.indexOf("const attachStream"));
    expect(src).toMatch(/const playbackGenerationRef = useRef\(0\)/);
    expect(playback).toMatch(/const isCurrentPlayback = \(\) =>[\s\S]{0,180}?currentAudioUrlRef\.current === url/);
    expect(playback).toMatch(/if \(!isCurrentPlayback\(\)\) return;/);
    // A discarded segment (gate closed, teardown, background) must never
    // transcribe or send; stale recorder callbacks check the live ref.
    expect(segment).toMatch(/let discarded = false/);
    expect(segment).toMatch(/if \(discarded\) return/);
    expect(segment).toMatch(/if \(recorderRef\.current === recorder\) recorderRef\.current = null/);
    // Mic loss surfaces text on screen AND in the server log — never silence.
    expect(src).toMatch(/track\.onended = \(\) =>/);
    expect(src).toMatch(/function reportHandsFreeIssue/);
    expect(src).toMatch(/reportHandsFreeIssue\(message\)/);
  });

  it("shows a recoverable voice failure instead of swallowing a failed TTS response", () => {
    const src = chat();
    const tts = src.slice(src.indexOf("const speakSentence"), src.indexOf("// Cleanup audio on unmount"));
    expect(tts).toMatch(/if \(!res\.ok\) \{\s*throw new Error\(await ttsErrorMessage\(res\)\)/);
    expect(tts).toMatch(/failedTtsTextRef\.current = next/);
    expect(tts).toContain("Try voice again");
    expect(src).toMatch(/const retryVoice = useCallback/);
    expect(src).toMatch(/async function ttsErrorMessage/);
    expect(src).toMatch(/T\.H\.E\.O\.'s voice returned HTTP \$\{res\.status\}/);
  });

  it("keeps real brainstorm API errors instead of replacing them with a fake connection error", () => {
    const src = chat();
    expect(src).toMatch(/async function brainstormErrorMessage/);
    expect(src).toMatch(/payload\.message[\s\S]{0,150}?payload\.error/);
    expect(src).not.toMatch(/credentials:\s*"same-origin"/);
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

  it("keeps a five-second recorded clip under Record and never finalizes it from Pause", () => {
    const engine = uploadEngine();
    const toggle = engine.slice(engine.indexOf("const toggleRecording"), engine.indexOf("const stopRecording"));
    const onStop = engine.slice(engine.indexOf("recorder.onstop"), engine.indexOf("mediaRecorderRef.current = recorder"));
    expect(toggle).toMatch(/mediaRecorderRef\.current\.pause\(\)/);
    expect(toggle).not.toMatch(/mediaRecorderRef\.current\.stop\(\)/);
    expect(onStop).toMatch(/setRecordings\(\(prev\) => \[\.\.\.prev, file\]\)/);
    expect(onStop).not.toMatch(/setFiles\(/);
    expect(intakeGrid()).toMatch(/p\.recordings\.map/);
    expect(intakeGrid()).not.toMatch(/p\.files\.map\(\(file\)[\s\S]*RECORDED HERE/);
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
