import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../..");
const chat = () => fs.readFileSync(path.join(SRC, "components/upload/BrainstormChat.tsx"), "utf8");
const route = () => fs.readFileSync(path.join(SRC, "app/api/brainstorm/transcribe/route.ts"), "utf8");

describe("iPhone persistent hands-free capture", () => {
  it("opens one MediaStream from Speak and keeps its tracks through TTS", () => {
    const src = chat();
    const start = src.slice(src.indexOf("const startPersistentMicrophone"), src.indexOf("const stopAudio"));
    const playback = src.slice(src.indexOf("const playNext"), src.indexOf("const speakSentence"));

    expect(start).toMatch(/navigator\.mediaDevices\.getUserMedia/);
    expect(start).toMatch(/micStreamRef\.current = stream/);
    expect(start).toMatch(/new MediaRecorder\(stream/);
    expect(start).toMatch(/audio\/mp4/);
    expect(playback).toMatch(/suspendCaptureRef\.current\?\.\(\)/);
    expect(playback).not.toMatch(/micStreamRef[\s\S]{0,100}?getTracks\(\)[\s\S]{0,100}?stop\(\)/);
  });

  it("preserves the three-second quiet-send contract", () => {
    const src = chat();
    const vad = src.slice(src.indexOf("vadTimerRef.current = setInterval"), src.indexOf("const stopAudio"));

    expect(vad).toMatch(/speechDetectedRef\.current = true/);
    expect(vad).toMatch(/silenceTimerRef\.current = setTimeout\([\s\S]*finishPersistentTurn\(\)[\s\S]*}, 3000\)/);
    expect(src).toMatch(/autoSendRef\.current\?\.\(transcript\)/);
  });

  it("disarms visibly on capture or transcription failure without muting TTS", () => {
    const src = chat();
    const failure = src.slice(src.indexOf("const failPersistentMicrophone"), src.indexOf("const submitRecordedTurn"));

    expect(failure).toMatch(/releasePersistentMicrophone\(\)/);
    expect(failure).toMatch(/setHandsFree\(false\)/);
    expect(failure).toMatch(/setSendError\(message\)/);
    expect(failure).not.toMatch(/setTtsEnabled\(false\)|ttsEnabledRef\.current = false|stopAudio\(\)/);
  });
});

describe("short-lived brainstorm transcription API", () => {
  it("authenticates, verifies project ownership, bounds input, and rate-limits vendor spend", () => {
    const src = route();

    expect(src).toMatch(/requireAuth\(\)/);
    expect(src).toMatch(/checkRateLimit\(user\.id, "brainstorm-transcribe", 30\)/);
    expect(src).toMatch(/MAX_AUDIO_BYTES/);
    expect(src).toMatch(/\.eq\("id", projectId\)[\s\S]*\.eq\("user_id", user\.id\)/);
  });

  it("transcribes in memory without persisting the voice recording", () => {
    const src = route();

    expect(src).toMatch(/transcribeAudio\(Buffer\.from\(await audio\.arrayBuffer\(\)\), audio\.type\)/);
    expect(src).not.toMatch(/audio_uploads|putObject|uploadFile|getUploadUrl/);
    expect(src).toMatch(/recordFlatInkUsage/);
  });
});
