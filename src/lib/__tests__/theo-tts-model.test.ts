/**
 * T.H.E.O. TTS MODEL PROBES — 2026-09-28
 *
 * Pins the Eleven v4 Turbo switch: the env allowlist, the unknown-value
 * fallback, the one retry on eleven_turbo_v2, and the hard-coded Finley voice.
 */

import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  THEO_TTS_DEFAULT_MODEL,
  THEO_TTS_FALLBACK_MODEL,
  THEO_TTS_MODELS,
  resolveTheoTtsModel,
} from "@/lib/tts";

const SRC = path.resolve(__dirname, "../..");
const route = () => fs.readFileSync(path.join(SRC, "app/api/tts/route.ts"), "utf8");

describe("T.H.E.O. TTS model: allowlist", () => {
  it("allows exactly v4 Turbo and turbo v2", () => {
    expect([...THEO_TTS_MODELS]).toEqual(["eleven_v4_turbo", "eleven_turbo_v2"]);
    expect(THEO_TTS_DEFAULT_MODEL).toBe("eleven_v4_turbo");
    expect(THEO_TTS_FALLBACK_MODEL).toBe("eleven_turbo_v2");
  });

  it("defaults to v4 Turbo when the env var is unset or blank", () => {
    expect(resolveTheoTtsModel(undefined)).toBe("eleven_v4_turbo");
    expect(resolveTheoTtsModel(null)).toBe("eleven_v4_turbo");
    expect(resolveTheoTtsModel("")).toBe("eleven_v4_turbo");
    expect(resolveTheoTtsModel("   ")).toBe("eleven_v4_turbo");
  });

  it("honors an allowlisted value, trimmed", () => {
    expect(resolveTheoTtsModel("eleven_turbo_v2")).toBe("eleven_turbo_v2");
    expect(resolveTheoTtsModel(" eleven_v4_turbo ")).toBe("eleven_v4_turbo");
  });

  it("sends anything unknown to turbo v2, never to an unvetted model", () => {
    expect(resolveTheoTtsModel("eleven_v3")).toBe("eleven_turbo_v2");
    expect(resolveTheoTtsModel("eleven_v4")).toBe("eleven_turbo_v2");
    expect(resolveTheoTtsModel("ELEVEN_V4_TURBO")).toBe("eleven_turbo_v2");
    expect(resolveTheoTtsModel("garbage")).toBe("eleven_turbo_v2");
  });
});

describe("T.H.E.O. TTS route: wiring and fallback", () => {
  it("picks the model from THEO_TTS_MODEL through the resolver, no hard-coded model", () => {
    const src = route();
    expect(src).toMatch(/resolveTheoTtsModel\(process\.env\.THEO_TTS_MODEL\)/);
    expect(src).toMatch(/model_id: modelId/);
    expect(src).not.toMatch(/model_id: "eleven_/);
  });

  it("keeps the Finley voice hard-coded, never env-driven", () => {
    const src = route();
    expect(src).toMatch(/const voiceId = "fnYMz3F5gMEDGMWcH1ex";/);
    expect(src).not.toMatch(/ELEVENLABS_VOICE_ID/);
  });

  it("retries once on turbo v2 when the chosen model errors or throws, and logs it", () => {
    const src = route();
    expect(src).toMatch(/!res\.ok && model !== THEO_TTS_FALLBACK_MODEL/);
    expect(src).toMatch(/logger\.warn\("ElevenLabs TTS model failed, retrying on fallback"/);
    expect(src).toMatch(/from: model, to: THEO_TTS_FALLBACK_MODEL/);
    expect(src.match(/callElevenLabs\(THEO_TTS_FALLBACK_MODEL\)/g)).toHaveLength(1);
  });
});
