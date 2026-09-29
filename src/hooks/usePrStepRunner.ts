"use client";

import { useCallback, useRef, useState } from "react";

/** A Publisher-Ready pass over one chapter. */
export type PrStep = "draft" | "edit" | "revise" | "final";

/** Chapters worked at once (each is its own streamed request). */
const CONCURRENCY: Record<PrStep, number> = { draft: 2, edit: 2, revise: 2, final: 3 };

type GuardedFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface StepChapter { id: string; chapter_number: number }

/**
 * Runs one Publisher-Ready step across a list of chapters, a few at a time,
 * reading each chapter's SSE stream to its end. Shared by First Draft, Editor
 * review and Final Draft (flow v2, Kyle 9/28) so there is one copy of the
 * stream handling. Still driven by the open tab, not a server-side job.
 */
export function usePrStepRunner(guardedFetch: GuardedFetch, onOutOfInk: () => void) {
  const [running, setRunning] = useState<PrStep | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const runStep = useCallback(async (
    runId: string,
    step: PrStep,
    todo: StepChapter[],
    onChapterDone?: (chapterId: string) => void,
  ): Promise<boolean> => {
    cancelRef.current = false;
    setError(null);
    setRunning(step);
    setProgress({ done: 0, total: todo.length });
    let failed = false;
    let completed = 0;
    const queue = [...todo];

    const worker = async () => {
      while (queue.length && !cancelRef.current && !failed) {
        const ch = queue.shift()!;
        const res = await guardedFetch("/api/publisher-ready/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ run_id: runId, chapter_id: ch.id, step }),
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          if (body.error !== "out_of_ink") setError(body.message || body.error || `Chapter ${ch.chapter_number} failed`);
          failed = true;
          return;
        }
        // Read the SSE stream to its end; the final event carries result or error.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let outcome: { done?: boolean; error?: string; message?: string; status?: number } = {};
        while (true) {
          const { done: end, value } = await reader.read();
          if (end) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.done || evt.error) outcome = evt;
            } catch { /* partial line */ }
          }
        }
        if (outcome.error) {
          if (outcome.status === 402) onOutOfInk();
          else setError(`Chapter ${ch.chapter_number}: ${outcome.message || outcome.error}`);
          failed = true;
          return;
        }
        completed++;
        setProgress({ done: completed, total: todo.length });
        onChapterDone?.(ch.id);
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY[step], todo.length || 1) }, worker));
    setRunning(null);
    return !failed && !cancelRef.current;
  }, [guardedFetch, onOutOfInk]);

  const pause = useCallback(() => { cancelRef.current = true; }, []);

  return { running, progress, error, setError, runStep, pause };
}
