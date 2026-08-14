/**
 * iPhone hands-free capture for the brainstorm studio.
 *
 * Web Speech cannot share an iOS audio session with HTMLAudio. This path keeps
 * one getUserMedia stream from the Speak tap and never stops those tracks while
 * T.H.E.O. talks. Speech goes to Deepgram (live socket, then short REST clips).
 */

export const QUIET_SEND_MS = 3000;
export const ECHO_SETTLE_MS = 400;
export const REST_CHUNK_MS = 900;

export const RECORDER_MIME_CANDIDATES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

export function micSupported(): boolean {
  return typeof navigator !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== "undefined";
}

export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return RECORDER_MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
}

export function getUserMediaErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access is blocked. On iPhone: tap aA in the address bar, then Website Settings, then Microphone. You can keep typing in the meantime.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone available. You can keep typing your answers.";
  }
  const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
  return `Hands-free could not start the microphone${detail}. Tap Speak to try again, or type your answer.`;
}

export function buildDeepgramListenUrl(): string {
  const params = new URLSearchParams({
    model: "nova-3",
    language: "en-US",
    smart_format: "true",
    interim_results: "true",
    punctuate: "true",
    endpointing: "300",
    vad_events: "true",
    mip_opt_out: "true",
  });
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

export function transcriptFromLiveMessage(payload: unknown): { transcript: string; isFinal: boolean } | null {
  if (!payload || typeof payload !== "object") return null;
  const message = payload as {
    type?: unknown;
    is_final?: unknown;
    speech_final?: unknown;
    channel?: { alternatives?: Array<{ transcript?: string }> };
  };
  if (message.type && message.type !== "Results") return null;
  const transcript = message.channel?.alternatives?.[0]?.transcript ?? "";
  if (!transcript) return null;
  return { transcript, isFinal: message.speech_final === true };
}

export type HandsFreeHandlers = {
  onListening: (listening: boolean) => void;
  onResult: (isFinal: boolean, transcript: string) => void;
  onError: (message: string, fatal: boolean) => void;
};

type CaptureMode = "idle" | "live" | "rest";

export class HandsFreeCapture {
  private handlers: HandsFreeHandlers;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private socket: WebSocket | null = null;
  private mimeType = "";
  private mode: CaptureMode = "idle";
  private stopped = true;
  private gated = false;
  private sendingAudio = true;
  private generation = 0;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private timesliceWatchdog: ReturnType<typeof setTimeout> | null = null;
  private restTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLiveChunkAt = 0;
  private restInFlight = false;
  private restQueued = false;

  constructor(handlers: HandsFreeHandlers) {
    this.handlers = handlers;
  }

  get active(): boolean {
    return !this.stopped && !!this.stream?.getAudioTracks().some((track) => track.readyState === "live");
  }

  get transcribing(): boolean {
    return this.restInFlight;
  }

  setGated(gated: boolean) {
    this.gated = gated;
    this.sendingAudio = !gated;
  }

  async start() {
    if (this.active) return;
    this.stop();
    this.stopped = false;
    const generation = ++this.generation;

    const mimeType = pickRecorderMime();
    if (!mimeType) {
      this.fail("This browser can't record audio for hands-free. You can keep typing your answers.", true);
      return;
    }
    this.mimeType = mimeType;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      this.fail(getUserMediaErrorMessage(error), true);
      return;
    }
    if (this.stopped || this.generation !== generation) {
      this.releaseStream();
      return;
    }

    for (const track of this.stream.getAudioTracks()) {
      track.onended = () => {
        if (this.stopped || this.generation !== generation) return;
        this.fail("The microphone stopped. Tap Speak to listen again, or type your answer.", true);
      };
      track.onmute = () => {
        if (this.stopped || this.generation !== generation || this.gated) return;
        this.handlers.onError("The microphone is muted. Check Control Center, then tap Speak to try again.", false);
      };
    }

    this.handlers.onListening(true);
    const liveOk = await this.connectLive(generation);
    if (this.stopped || this.generation !== generation) return;
    if (liveOk) {
      this.mode = "live";
      this.startLiveRecorder(generation);
      return;
    }
    this.mode = "rest";
    this.scheduleRestChunk(generation);
  }

  stop() {
    this.stopped = true;
    this.generation += 1;
    this.mode = "idle";
    this.gated = false;
    this.sendingAudio = true;
    this.restInFlight = false;
    this.restQueued = false;
    this.clearTimers();
    this.closeSocket();
    this.stopRecorder();
    this.releaseStream();
    this.handlers.onListening(false);
  }

  private fail(message: string, fatal: boolean) {
    this.handlers.onError(message, fatal);
    if (fatal) this.stop();
  }

  private clearTimers() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
    if (this.timesliceWatchdog) clearTimeout(this.timesliceWatchdog);
    if (this.restTimer) clearTimeout(this.restTimer);
    this.keepAliveTimer = null;
    this.tokenRefreshTimer = null;
    this.timesliceWatchdog = null;
    this.restTimer = null;
  }

  private releaseStream() {
    if (!this.stream) return;
    this.stream.getTracks().forEach((track) => {
      track.onended = null;
      track.onmute = null;
      track.stop();
    });
    this.stream = null;
  }

  private stopRecorder() {
    const recorder = this.recorder;
    this.recorder = null;
    if (!recorder) return;
    recorder.ondataavailable = null;
    recorder.onerror = null;
    recorder.onstop = null;
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      // Already stopped.
    }
  }

  private closeSocket() {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "CloseStream" }));
      }
      socket.close();
    } catch {
      // Socket already closed.
    }
  }

  private async connectLive(generation: number): Promise<boolean> {
    try {
      const res = await fetch("/api/brainstorm/stt-token", { method: "POST" });
      if (!res.ok) return false;
      const payload = await res.json() as { access_token?: unknown; expires_in?: unknown };
      if (typeof payload.access_token !== "string" || !payload.access_token) return false;
      if (this.stopped || this.generation !== generation) return false;

      const token = payload.access_token;
      const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 180;
      const socket = this.openLiveSocket(token);
      const opened = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 4000);
        socket.onopen = () => {
          clearTimeout(timeout);
          resolve(true);
        };
        socket.onerror = () => {
          clearTimeout(timeout);
          resolve(false);
        };
      });
      if (!opened || this.stopped || this.generation !== generation) {
        try { socket.close(); } catch { /* ignore */ }
        return false;
      }

      this.socket = socket;
      socket.onmessage = (event) => this.handleLiveMessage(event, generation);
      socket.onclose = () => {
        if (this.stopped || this.generation !== generation || this.mode !== "live") return;
        this.switchToRest(generation);
      };
      socket.onerror = () => {
        if (this.stopped || this.generation !== generation || this.mode !== "live") return;
        this.switchToRest(generation);
      };
      this.keepAliveTimer = setInterval(() => {
        if (this.socket?.readyState === WebSocket.OPEN) {
          try { this.socket.send(JSON.stringify({ type: "KeepAlive" })); } catch { /* ignore */ }
        }
      }, 8000);
      this.tokenRefreshTimer = setTimeout(() => {
        if (this.stopped || this.generation !== generation || this.mode !== "live") return;
        void this.reconnectLive(generation);
      }, Math.max(20_000, (expiresIn - 30) * 1000));
      return true;
    } catch {
      return false;
    }
  }

  private openLiveSocket(token: string): WebSocket {
    const url = buildDeepgramListenUrl();
    try {
      return new WebSocket(url, ["bearer", token]);
    } catch {
      const withAuth = `${url}&authorization=${encodeURIComponent(`bearer ${token}`)}`;
      return new WebSocket(withAuth);
    }
  }

  private async reconnectLive(generation: number) {
    this.closeSocket();
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
    const ok = await this.connectLive(generation);
    if (!ok && !this.stopped && this.generation === generation) {
      this.switchToRest(generation);
    }
  }

  private handleLiveMessage(event: MessageEvent, generation: number) {
    if (this.stopped || this.generation !== generation || this.gated || !this.sendingAudio) return;
    let payload: unknown = event.data;
    if (typeof event.data === "string") {
      try { payload = JSON.parse(event.data); } catch { return; }
    }
    const result = transcriptFromLiveMessage(payload);
    if (!result) return;
    this.handlers.onResult(result.isFinal, result.transcript);
  }

  private startLiveRecorder(generation: number) {
    if (!this.stream) return;
    this.stopRecorder();
    const recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
    this.recorder = recorder;
    this.lastLiveChunkAt = Date.now();
    recorder.ondataavailable = (event) => {
      if (this.stopped || this.generation !== generation) return;
      if (event.data.size > 0) this.lastLiveChunkAt = Date.now();
      if (!this.sendingAudio || this.socket?.readyState !== WebSocket.OPEN) return;
      if (event.data.size > 0) {
        try { this.socket.send(event.data); } catch { /* ignore */ }
      }
    };
    recorder.onerror = () => {
      if (this.stopped || this.generation !== generation) return;
      this.switchToRest(generation);
    };
    try {
      recorder.start(250);
    } catch {
      this.switchToRest(generation);
      return;
    }
    this.armTimesliceWatchdog(generation);
  }

  private armTimesliceWatchdog(generation: number) {
    if (this.timesliceWatchdog) clearTimeout(this.timesliceWatchdog);
    this.timesliceWatchdog = setTimeout(() => {
      if (this.stopped || this.generation !== generation || this.mode !== "live") return;
      if (Date.now() - this.lastLiveChunkAt < 1400) {
        this.armTimesliceWatchdog(generation);
        return;
      }
      this.switchToRest(generation);
    }, 1500);
  }

  private switchToRest(generation: number) {
    if (this.stopped || this.generation !== generation) return;
    this.mode = "rest";
    this.closeSocket();
    this.stopRecorder();
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
    if (this.timesliceWatchdog) clearTimeout(this.timesliceWatchdog);
    this.keepAliveTimer = null;
    this.tokenRefreshTimer = null;
    this.timesliceWatchdog = null;
    this.scheduleRestChunk(generation);
  }

  private scheduleRestChunk(generation: number) {
    if (this.stopped || this.generation !== generation) return;
    if (this.restTimer) clearTimeout(this.restTimer);
    this.restTimer = setTimeout(() => {
      void this.captureRestChunk(generation);
    }, 0);
  }

  private async captureRestChunk(generation: number) {
    if (this.stopped || this.generation !== generation || this.mode !== "rest" || !this.stream) return;
    if (this.gated) {
      this.restTimer = setTimeout(() => void this.captureRestChunk(generation), REST_CHUNK_MS);
      return;
    }

    const blob = await this.recordClip(REST_CHUNK_MS, generation);
    if (this.stopped || this.generation !== generation) return;
    if (blob && blob.size > 400 && this.sendingAudio && !this.gated) {
      await this.transcribeClip(blob, generation);
    }
    if (!this.stopped && this.generation === generation) {
      this.scheduleRestChunk(generation);
    }
  }

  private recordClip(durationMs: number, generation: number): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.stream) {
        resolve(null);
        return;
      }
      const chunks: Blob[] = [];
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
      } catch {
        this.fail("This browser can't record audio for hands-free. You can keep typing your answers.", true);
        resolve(null);
        return;
      }
      this.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => resolve(null);
      recorder.onstop = () => {
        if (this.recorder === recorder) this.recorder = null;
        resolve(chunks.length ? new Blob(chunks, { type: this.mimeType }) : null);
      };
      try {
        recorder.start();
      } catch {
        resolve(null);
        return;
      }
      setTimeout(() => {
        if (this.generation !== generation) {
          resolve(null);
          return;
        }
        try {
          if (recorder.state === "recording") recorder.stop();
        } catch {
          resolve(null);
        }
      }, durationMs);
    });
  }

  private async transcribeClip(blob: Blob, generation: number) {
    if (this.restInFlight) {
      this.restQueued = true;
      return;
    }
    this.restInFlight = true;
    try {
      const res = await fetch("/api/brainstorm/stt", {
        method: "POST",
        headers: { "Content-Type": this.mimeType },
        body: blob,
      });
      if (this.stopped || this.generation !== generation) return;
      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: unknown; message?: unknown };
        const detail = typeof payload.message === "string"
          ? payload.message
          : typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`;
        const message = `Hands-free lost the speech service (${detail}). Tap Speak to try again, or type your answer.`;
        if (res.status === 401 || res.status === 402) this.fail(message, true);
        else this.handlers.onError(message, false);
        return;
      }
      const payload = await res.json() as { transcript?: unknown };
      const transcript = typeof payload.transcript === "string" ? payload.transcript.trim() : "";
      if (transcript && !this.gated) this.handlers.onResult(true, transcript);
    } catch (error) {
      if (this.stopped || this.generation !== generation) return;
      const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
      this.handlers.onError(`Hands-free could not reach the speech service${detail}. Tap Speak to try again, or type your answer.`, false);
    } finally {
      this.restInFlight = false;
      if (this.restQueued && !this.stopped && this.generation === generation) {
        this.restQueued = false;
      }
    }
  }
}
