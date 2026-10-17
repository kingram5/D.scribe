// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LiveInterview from "../LiveInterview";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const runId = "isolated-live-regression-fixture";
let host: HTMLDivElement, root: Root | null;
let track: { stop: ReturnType<typeof vi.fn>; enabled: boolean };
let media: ReturnType<typeof vi.fn>, request: ReturnType<typeof vi.fn>;
let peers: FakePeer[];
let pendingOffer: Promise<object> | null;
class FakePeer {
  iceGatheringState = "complete";
  localDescription = { sdp: "isolated-sdp" };
  connectionState = "connected";
  ontrack = null;
  onconnectionstatechange = null;
  onicegatheringstatechange = null;
  close = vi.fn();
  addTrack = vi.fn();
  createDataChannel = () => ({ onmessage: null });
  createOffer = vi.fn(() => pendingOffer ?? Promise.resolve({}));
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async () => {});
  constructor() { peers.push(this); }
}
const ok = (data: object = {}) => ({ ok: true, json: async () => data });
function actions() { return request.mock.calls.filter(([url]) => url === "/api/publisher-ready/live").map(([, init]) => JSON.parse(init.body)); }
function findButton(label: string) {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!button) throw new Error(`Missing button ${label}`);
  return button;
}
async function click(label: string) { await act(async () => { findButton(label).click(); }); }
async function type(text: string) {
  await act(async () => {
    const input = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function mount() {
  root = createRoot(host);
  await act(async () => root!.render(<LiveInterview runId={runId} onClose={() => {}} />));
}
async function unmount() { await act(async () => root?.unmount()); root = null; }
async function readyToWrite() { await click("Start audio"); await click("Pause / save"); }
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  sessionStorage.clear();
  peers = []; pendingOffer = null;
  track = { stop: vi.fn(), enabled: true };
  media = vi.fn(async () => ({ getTracks: () => [track] }));
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: media } });
  vi.stubGlobal("RTCPeerConnection", FakePeer);
  vi.stubGlobal("Audio", class { autoplay = false; srcObject = null; pause() {} play = async () => {}; });
  request = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    return ok(body.action === "start" ? { id: "isolated-session", questionId: "isolated-question", sdp: "isolated-answer" } : { state: "closed", answerId: "isolated-author-answer" });
  });
  vi.stubGlobal("fetch", request);
  host = document.createElement("div"); document.body.append(host);
  await mount();
});
afterEach(async () => { await unmount(); host.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Live interview cancellation and author draft recovery (no vendor calls)", () => {
  it("stops a microphone granted after unmount without dispatching a session", async () => {
    const pending = deferred<MediaStream>(); media.mockReturnValue(pending.promise);
    await click("Start audio"); await unmount();
    await act(async () => pending.resolve({ getTracks: () => [track] } as unknown as MediaStream));
    expect(track.stop).toHaveBeenCalledOnce(); expect(peers).toHaveLength(0); expect(actions()).toEqual([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); }); expect(actions()).toEqual([]);
  });
  it("stops startup when the tab backgrounds before microphone permission resolves", async () => {
    const pending = deferred<MediaStream>(); media.mockReturnValue(pending.promise);
    await click("Start audio");
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    await act(async () => pending.resolve({ getTracks: () => [track] } as unknown as MediaStream));
    expect(track.stop).toHaveBeenCalledOnce(); expect(actions()).toEqual([]);
  });
  it("does not dispatch after SDP preparation completes following unmount", async () => {
    const pending = deferred<object>(); pendingOffer = pending.promise;
    await click("Start audio");
    await unmount(); await act(async () => pending.resolve({}));
    expect(actions()).toEqual([]); expect(peers[0].close).toHaveBeenCalled();
  });
  it("closes a late start response explicitly and never installs its heartbeat", async () => {
    const pending = deferred<ReturnType<typeof ok>>();
    request.mockImplementation(async (_url: string, init: RequestInit) => JSON.parse(init.body as string).action === "start" ? pending.promise : ok());
    await click("Start audio"); await unmount();
    await act(async () => pending.resolve(ok({ id: "late-session", questionId: "isolated-question", sdp: "isolated-answer" })));
    expect(actions().find((a) => a.action === "stop")).toMatchObject({ id: "late-session" });
    expect(peers[0].setRemoteDescription).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(actions().some((a) => a.action === "pulse")).toBe(false);
  });
  it("locks duplicate saves while pending, preserving newer writing on success", async () => {
    await readyToWrite(); await type("ISOLATED first revision");
    const pending = deferred<ReturnType<typeof ok>>(); request.mockReturnValue(pending.promise);
    const button = findButton("Save typed answer");
    await act(async () => { button.click(); button.click(); });
    expect(findButton("Saving…").disabled).toBe(true);
    expect(request.mock.calls.filter(([url]) => url === "/api/publisher-ready/interview")).toHaveLength(1);
    await type("ISOLATED newer unsaved revision");
    await act(async () => pending.resolve(ok()));
    expect(host.querySelector("textarea")!.value).toBe("ISOLATED newer unsaved revision");
  });
  it("recovers text and its question after unmount and allows saving without another audio call", async () => {
    await readyToWrite(); await type("ISOLATED recovered author draft");
    await unmount(); await mount();
    expect(host.querySelector("textarea")!.value).toBe("ISOLATED recovered author draft");
    expect(findButton("Save typed answer").disabled).toBe(false);
    request.mockClear(); await click("Save typed answer");
    expect(actions()).toEqual([]);
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ question_id: "isolated-question", transcript: "ISOLATED recovered author draft" });
    expect(host.querySelector("textarea")!.value).toBe("");
    await unmount(); await mount(); expect(host.querySelector("textarea")!.value).toBe("");
  });
  it("does not let an old component's save erase writing entered after remount", async () => {
    await readyToWrite(); await type("ISOLATED submitted before leaving");
    const pending = deferred<ReturnType<typeof ok>>(); request.mockReturnValue(pending.promise);
    await click("Save typed answer"); await unmount(); await mount();
    await type("ISOLATED newer text after returning");
    await act(async () => pending.resolve(ok()));
    expect(host.querySelector("textarea")!.value).toBe("ISOLATED newer text after returning");
  });
  it("retains recoverable text and reports a network save failure, allowing retry", async () => {
    await readyToWrite(); await type("ISOLATED retry draft"); request.mockRejectedValueOnce(new TypeError("offline"));
    await click("Save typed answer");
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("Could not save");
    expect(host.querySelector("textarea")!.value).toBe("ISOLATED retry draft");
    expect(findButton("Save typed answer").disabled).toBe(false);
    await click("Save typed answer"); expect(host.querySelector("textarea")!.value).toBe("");
  });
});
