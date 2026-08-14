import { describe, expect, it } from "vitest";
import {
  QUIET_SEND_MS,
  buildDeepgramListenUrl,
  getUserMediaErrorMessage,
  transcriptFromLiveMessage,
} from "@/lib/hands-free-capture";
import { transcriptFromDeepgramResponse } from "@/lib/deepgram";
import fs from "fs";
import path from "path";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

describe("hands-free capture helpers", () => {
  it("keeps the three-second quiet-send timeout", () => {
    expect(QUIET_SEND_MS).toBe(3000);
    expect(read("components/upload/BrainstormChat.tsx")).toMatch(/}, QUIET_SEND_MS\)/);
  });

  it("never stops media tracks while T.H.E.O. is talking", () => {
    const src = read("lib/hands-free-capture.ts");
    const gated = src.slice(src.indexOf("setGated"), src.indexOf("async start"));
    expect(gated).not.toMatch(/track\.stop\(|getTracks\(\)/);
    expect(src).toMatch(/getUserMedia/);
    expect(src).toMatch(/echoCancellation:\s*true/);
  });

  it("explains iPhone microphone denial instead of failing silently", () => {
    const denied = new DOMException("denied", "NotAllowedError");
    expect(getUserMediaErrorMessage(denied)).toMatch(/Website Settings/);
    expect(getUserMediaErrorMessage(new DOMException("missing", "NotFoundError"))).toMatch(/No microphone available/);
    expect(getUserMediaErrorMessage(new Error("boom"))).toMatch(/Hands-free could not start the microphone \(boom\)/);
  });

  it("reads live and REST Deepgram transcripts", () => {
    expect(transcriptFromLiveMessage({
      type: "Results",
      is_final: true,
      speech_final: true,
      channel: { alternatives: [{ transcript: "hello there" }] },
    })).toEqual({ transcript: "hello there", isFinal: true });
    expect(transcriptFromLiveMessage({
      type: "Results",
      is_final: true,
      speech_final: false,
      channel: { alternatives: [{ transcript: "hello" }] },
    })).toEqual({ transcript: "hello", isFinal: false });
    expect(transcriptFromLiveMessage({ type: "Metadata" })).toBeNull();
    expect(transcriptFromDeepgramResponse({
      results: { channels: [{ alternatives: [{ transcript: "  later turn  " }] }] },
    })).toBe("later turn");
  });

  it("opens Deepgram listen with interim results and training opt-out", () => {
    const url = buildDeepgramListenUrl();
    expect(url).toContain("wss://api.deepgram.com/v1/listen");
    expect(url).toContain("interim_results=true");
    expect(url).toContain("mip_opt_out=true");
  });
});

describe("hands-free API routes", () => {
  it("grants a short-lived Deepgram token without exposing the API key", () => {
    const src = read("app/api/brainstorm/stt-token/route.ts");
    expect(src).toMatch(/api\.deepgram\.com\/v1\/auth\/grant/);
    expect(src).toMatch(/ttl_seconds/);
    expect(src).toMatch(/requireAuth/);
    expect(src).not.toMatch(/DEEPGRAM_API_KEY.*access_token/);
  });

  it("transcribes short studio clips through the existing Deepgram client", () => {
    const src = read("app/api/brainstorm/stt/route.ts");
    expect(src).toMatch(/transcribeUtterance/);
    expect(src).toMatch(/requireAuth/);
    expect(src).toMatch(/checkInk\(user\.id, "transcribe"\)/);
  });
});
