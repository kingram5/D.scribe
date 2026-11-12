"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A Publisher-Ready pass over one chapter. */
export type PrStep = "draft" | "edit" | "revise" | "final";
const CONCURRENCY: Record<PrStep, number> = { draft: 2, edit: 2, revise: 2, final: 3 };
type GuardedFetch = (input: string, init?: RequestInit) => Promise<Response>;
export interface StepChapter { id: string; chapter_number: number }

/** Client-driven chapter requests. Only a matching durable done event counts. */
export function usePrStepRunner(guardedFetch: GuardedFetch, onOutOfInk: () => void) {
  const [running, setRunning] = useState<PrStep | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const activeRef = useRef(false);
  const mountedRef = useRef(true);
  const controllersRef = useRef(new Set<AbortController>());

  useEffect(() => {
    mountedRef.current = true;
    const controllers = controllersRef.current;
    return () => {
      mountedRef.current = false;
      cancelRef.current = true;
      for (const controller of controllers) controller.abort();
    };
  }, []);

  const runStep = useCallback(async (
    runId: string,
    step: PrStep,
    todo: StepChapter[],
    onChapterDone?: (chapterId: string, result?: unknown) => void | Promise<void>,
  ): Promise<boolean> => {
    // A second click must not reset cancellation or launch duplicate paid work.
    if (activeRef.current || !mountedRef.current) return false;
    activeRef.current = true;
    cancelRef.current = false;
    setError(null);
    setRunning(step);
    let failed = false;
    let completed = 0;
    const queue = [...new Map(todo.map((ch) => [ch.id, ch])).values()];
    const total = queue.length;
    setProgress({ done: 0, total });

    const worker = async () => {
      while (queue.length && !cancelRef.current && !failed) {
        const ch = queue.shift()!;
        const controller = new AbortController();
        controllersRef.current.add(controller);
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        try {
          const res = await guardedFetch("/api/publisher-ready/step", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ run_id: runId, chapter_id: ch.id, step }),
            signal: controller.signal,
          });
          controller.signal.throwIfAborted();
          if (!res.ok || !res.body) {
            const body = await res.json().catch(() => ({}));
            if (res.status === 402 || body.error === "out_of_ink") onOutOfInk();
            throw new Error(body.message || body.error || "Request failed");
          }
          reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let confirmed = false;
          let result: unknown;
          const readLine = (line: string) => {
            if (!line.startsWith("data:")) return;
            const data = line.slice(5).trim();
            if (data === "[DONE]") return;
            const evt = JSON.parse(data);
            if (evt.error) {
              if (evt.status === 402 || evt.error === "out_of_ink") onOutOfInk();
              throw new Error(evt.message || evt.error);
            }
            if (evt.done === true) {
              if (evt.chapter_id !== ch.id || evt.step !== step) throw new Error("Unexpected completion event");
              confirmed = true;
              result = evt.result;
            }
          };
          while (!confirmed) {
            const { done, value } = await reader.read();
            controller.signal.throwIfAborted();
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) readLine(line);
            if (done) {
              if (buffer.trim()) readLine(buffer);
              break;
            }
          }
          if (!confirmed) throw new Error("Completion was not confirmed. Reload progress before retrying.");
          if (!mountedRef.current) return;
          completed++;
          setProgress({ done: completed, total });
          await onChapterDone?.(ch.id, result);
        } catch (err) {
          if (!failed && mountedRef.current) {
            const message = controller.signal.aborted || (err instanceof Error && err.name === "AbortError")
              ? "Request interrupted. Reload progress before retrying."
              : err instanceof Error ? err.message : "Request failed";
            setError(`Chapter ${ch.chapter_number}: ${message}`);
          }
          failed = true;
        } finally {
          if (reader) {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
          controllersRef.current.delete(controller);
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY[step], total) }, worker));
      return !failed && !cancelRef.current && completed === total;
    } finally {
      activeRef.current = false;
      if (mountedRef.current) setRunning(null);
    }
  }, [guardedFetch, onOutOfInk]);

  // Stop dequeuing; let in-flight requests confirm their saved results. Closing
  // a stream does not cancel server generation or undo its Ink charge.
  const pause = useCallback(() => { cancelRef.current = true; }, []);
  return { running, progress, error, setError, runStep, pause };
}
