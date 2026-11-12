import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ChapterContent } from "@/types";

// Exercise the real hook callbacks and refs with deterministic React state slots.
// DOM and TipTap behavior are verified separately by the local UI fixture.
const react = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, cleanups: [] as (() => void)[] }));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const i = react.index++;
    if (!(i in react.slots)) react.slots[i] = initial;
    return [react.slots[i], (value: unknown) => { react.slots[i] = typeof value === "function" ? value(react.slots[i]) : value; }];
  },
  useRef(initial: unknown) {
    const i = react.index++;
    if (!(i in react.slots)) react.slots[i] = { current: initial };
    return react.slots[i];
  },
  useCallback: (fn: unknown) => fn,
  useEffect(fn: () => (() => void) | void) {
    const i = react.index++;
    if (!(i in react.slots)) { react.slots[i] = true; const cleanup = fn(); if (cleanup) react.cleanups.push(cleanup); }
  },
}));
import { useChapterEdits } from "../useChapterEdits";
import { usePrStepRunner } from "../usePrStepRunner";

function render<T>(callback: () => T) { react.index = 0; return callback(); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const chapters = Array.from({ length: 5 }, (_, i) => ({ id: `ch${i + 1}`, chapter_number: i + 1 }));
const done = (id = "ch1", step = "draft") => `data: ${JSON.stringify({ done: true, chapter_id: id, step, result: { version: 2 } })}\n\ndata: [DONE]\n\n`;
beforeEach(() => { react.slots = []; react.index = 0; react.cleanups = []; });
afterEach(() => { for (const cleanup of react.cleanups) cleanup(); vi.unstubAllGlobals(); });

describe("chapter drafts and save lifecycle", () => {
  const stored = { content: "Draft one", word_count: 2, version: 2 } as ChapterContent;
  it("keeps edits, including empty drafts, through repeated chapter switches and revisions", () => {
    const useTestHook = () => useChapterEdits(vi.fn());
    const edits = render(useTestHook);
    edits.loadChapter("one", "Saved one"); edits.handleContentChange("Unsaved sentence");
    edits.loadChapter("two", "Saved two"); edits.handleContentChange("");
    expect(edits.refreshChapter("one", "New revision")).toBe(false);
    for (let i = 0; i < 3; i++) {
      edits.loadChapter("one", "Saved one"); expect(render(useTestHook).content).toBe("Unsaved sentence");
      edits.loadChapter("two", "Saved two"); expect(render(useTestHook).content).toBe("");
    }
    expect(render(useTestHook).dirty).toBe(true);
    expect(render(useTestHook).saved).toBe(false);
  });
  it("saves the original chapter snapshot and preserves newer edits during the request", async () => {
    const pending = deferred<Response>(); const fetcher = vi.fn((url: string, init?: RequestInit) => { void url; void init; return pending.promise; });
    vi.stubGlobal("fetch", fetcher);
    const onSaved = vi.fn(); const useTestHook = () => useChapterEdits(onSaved); const edits = render(useTestHook);
    edits.loadChapter("one", "Saved one"); edits.handleContentChange("Draft one");
    const saving = edits.saveContent();
    expect(await edits.saveContent()).toBe(false); expect(fetcher).toHaveBeenCalledTimes(1);
    edits.handleContentChange("Newer draft"); edits.loadChapter("two", "Saved two"); edits.handleContentChange("Draft two");
    pending.resolve(Response.json(stored)); expect(await saving).toBe(true);
    expect(onSaved).toHaveBeenCalledWith("one", stored);
    expect(render(useTestHook).content).toBe("Draft two"); expect(render(useTestHook).saved).toBe(false);
    edits.loadChapter("one", stored.content); expect(render(useTestHook).content).toBe("Newer draft");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ content: "Draft one" });
    expect(fetcher.mock.calls[0][0]).toBe("/api/chapter-content/one");
    expect(render(useTestHook).saving).toBe(false);
  });
  it.each(["network", "http", "invalid"])("retains drafts and recovers from %s save failure", async (kind) => {
    const fetcher = vi.fn().mockImplementationOnce(() => {
      if (kind === "network") throw new TypeError("Offline");
      return Promise.resolve(kind === "http" ? new Response("", { status: 500 }) : Response.json({}));
    }).mockResolvedValue(Response.json(stored));
    vi.stubGlobal("fetch", fetcher);
    const useTestHook = () => useChapterEdits(vi.fn()); const edits = render(useTestHook);
    edits.loadChapter("one", "Saved"); edits.handleContentChange(stored.content);
    expect(await edits.saveContent()).toBe(false);
    expect(render(useTestHook).saveError).toBeTruthy(); expect(render(useTestHook).saving).toBe(false);
    expect(render(useTestHook).dirty).toBe(true); expect(render(useTestHook).content).toBe(stored.content);
    expect(await edits.saveContent()).toBe(true);
    expect(render(useTestHook).dirty).toBe(false); expect(render(useTestHook).saved).toBe(true); expect(render(useTestHook).saveError).toBeNull();
    edits.loadChapter("two", "Other"); edits.loadChapter("one", stored.content);
    expect(render(useTestHook).content).toBe(stored.content);
    expect(edits.refreshChapter("one", "Confirmed revision")).toBe(true);
    expect(render(useTestHook).content).toBe("Confirmed revision");
  });
});

describe("Publisher-Ready completion lifecycle", () => {
  it.each(["", "data: [DONE]\n\n", "data: {\"heartbeat\":true}\n\n", "data: {bad}\n\n", done("other"), done("ch1", "final")])("rejects unconfirmed or invalid streams: %s", async (body) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(body)); const callback = vi.fn();
    const useTestHook = () => usePrStepRunner(fetcher, vi.fn()); const runner = render(useTestHook);
    expect(await runner.runStep("run", "draft", chapters.slice(0, 1), callback)).toBe(false);
    expect(callback).not.toHaveBeenCalled(); expect(render(useTestHook).progress).toEqual({ done: 0, total: 1 });
    expect(render(useTestHook).running).toBeNull(); expect(render(useTestHook).error).toBeTruthy();
  });
  it.each(["fetch", "reader", "abort", "http"])("recovers after %s failure and permits a subsequent run", async (kind) => {
    const fetcher = vi.fn().mockImplementationOnce(() => {
      if (kind === "fetch") return Promise.reject(new TypeError("Offline"));
      if (kind === "abort") return Promise.reject(new DOMException("Aborted", "AbortError"));
      if (kind === "reader") return Promise.resolve(new Response(new ReadableStream({ start(c) { c.error(new Error("Disconnected")); } })));
      return Promise.resolve(new Response("", { status: 503 }));
    }).mockResolvedValue(new Response(done()));
    const callback = vi.fn(); const useTestHook = () => usePrStepRunner(fetcher, vi.fn()); const runner = render(useTestHook);
    expect(await runner.runStep("run", "draft", chapters.slice(0, 1), callback)).toBe(false);
    expect(render(useTestHook).running).toBeNull(); expect(render(useTestHook).error).toBeTruthy(); expect(callback).not.toHaveBeenCalled();
    expect(await runner.runStep("run", "draft", chapters.slice(0, 1), callback)).toBe(true);
    expect(render(useTestHook).progress.done).toBe(1); expect(render(useTestHook).error).toBeNull(); expect(callback).toHaveBeenCalledTimes(1);
  });
  it("handles fragmented CRLF, UTF-8 and a final line without newline, then releases the reader", async () => {
    const bytes = new TextEncoder().encode(`: comment\r\ndata: {"chunk":"café"}\r\n\r\n${done().trim()}`);
    const stream = new ReadableStream<Uint8Array>({ start(c) { for (const b of bytes) c.enqueue(new Uint8Array([b])); c.close(); } });
    const fetcher = vi.fn().mockResolvedValue(new Response(stream)); const callback = vi.fn();
    const runner = render(() => usePrStepRunner(fetcher, vi.fn()));
    expect(await runner.runStep("run", "draft", chapters.slice(0, 1), callback)).toBe(true);
    expect(callback).toHaveBeenCalledExactlyOnceWith("ch1", { version: 2 }); expect(stream.locked).toBe(false);
  });
  it.each([false, true])("reports Ink exhaustion for HTTP or streamed error (stream=%s)", async (streamed) => {
    const body = { error: "out_of_ink", message: "More Ink required", status: 402 };
    const fetcher = vi.fn().mockResolvedValue(streamed ? new Response(`data: ${JSON.stringify(body)}\n\n`) : Response.json(body, { status: 402 }));
    const upgrade = vi.fn(); const useTestHook = () => usePrStepRunner(fetcher, upgrade); const runner = render(useTestHook);
    expect(await runner.runStep("run", "draft", chapters.slice(0, 1))).toBe(false);
    expect(upgrade).toHaveBeenCalledTimes(1); expect(render(useTestHook).running).toBeNull(); expect(render(useTestHook).error).toContain("More Ink required");
  });
  it("pauses queued chapters, confirms in-flight saves, and rejects overlapping runs", async () => {
    const requests = [deferred<Response>(), deferred<Response>()]; let n = 0;
    const fetcher = vi.fn(() => requests[n++].promise); const callback = vi.fn(); const useTestHook = () => usePrStepRunner(fetcher, vi.fn());
    const runner = render(useTestHook); const running = runner.runStep("run", "draft", chapters, callback);
    expect(await runner.runStep("run", "draft", chapters)).toBe(false); runner.pause();
    requests[0].resolve(new Response(done("ch1"))); requests[1].resolve(new Response(done("ch2")));
    expect(await running).toBe(false); expect(fetcher).toHaveBeenCalledTimes(2); expect(callback).toHaveBeenCalledTimes(2);
    expect(render(useTestHook).progress).toEqual({ done: 2, total: 5 }); expect(render(useTestHook).running).toBeNull();
  });
  it("waits for concurrent workers to settle on failure without launching more chapters", async () => {
    const pending = deferred<Response>(); const fetcher = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockReturnValueOnce(pending.promise);
    const useTestHook = () => usePrStepRunner(fetcher, vi.fn()); const runner = render(useTestHook); const callback = vi.fn();
    const running = runner.runStep("run", "draft", chapters, callback); await Promise.resolve();
    expect(render(useTestHook).running).toBe("draft"); expect(await runner.runStep("run", "draft", chapters)).toBe(false);
    pending.resolve(new Response(done("ch2"))); expect(await running).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(callback).toHaveBeenCalledExactlyOnceWith("ch2", { version: 2 });
    expect(render(useTestHook).progress).toEqual({ done: 1, total: 5 }); expect(render(useTestHook).running).toBeNull();
  });
  it("aborts fetches on unmount and prevents late callbacks or state changes", async () => {
    const fetcher = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const runner = render(() => usePrStepRunner(fetcher, vi.fn())); const callback = vi.fn();
    const running = runner.runStep("run", "draft", chapters, callback);
    for (const cleanup of react.cleanups) cleanup();
    const snapshot = [...react.slots]; expect(await running).toBe(false);
    expect(react.slots).toEqual(snapshot); expect(callback).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.every(([, init]) => init!.signal!.aborted)).toBe(true);
  });
  it("deduplicates input chapters and handles an empty pending list", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(done())); const callback = vi.fn();
    const useTestHook = () => usePrStepRunner(fetcher, vi.fn()); const runner = render(useTestHook);
    expect(await runner.runStep("run", "draft", [chapters[0], chapters[0]], callback)).toBe(true);
    expect(render(useTestHook).progress).toEqual({ done: 1, total: 1 }); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await runner.runStep("run", "draft", [], callback)).toBe(true); expect(render(useTestHook).running).toBeNull();
  });
});
