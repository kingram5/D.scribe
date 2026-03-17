"use client";

import { useState, useCallback, useRef } from "react";

interface JobProgress {
  step: string;
  [key: string]: unknown;
}

interface JobState<T = unknown> {
  jobId: string | null;
  status: "idle" | "pending" | "running" | "completed" | "failed";
  progress: JobProgress | null;
  result: T | null;
  error: string | null;
}

const POLL_INTERVAL = 2000;

export function useJob<T = unknown>() {
  const [state, setState] = useState<JobState<T>>({
    jobId: null,
    status: "idle",
    progress: null,
    result: null,
    error: null,
  });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const poll = useCallback(
    (jobId: string) => {
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/jobs/${jobId}`);
          if (!res.ok) return;

          const data = await res.json();
          setState((prev) => ({
            ...prev,
            status: data.status,
            progress: data.progress || prev.progress,
            result: data.result || null,
            error: data.error || null,
          }));

          if (data.status === "completed" || data.status === "failed") {
            stopPolling();
          }
        } catch {
          // Network error — keep polling
        }
      }, POLL_INTERVAL);
    },
    [stopPolling]
  );

  const start = useCallback(
    async (body: Record<string, unknown>): Promise<string | null> => {
      stopPolling();
      setState({
        jobId: null,
        status: "pending",
        progress: null,
        result: null,
        error: null,
      });

      try {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json();
          setState((prev) => ({
            ...prev,
            status: "failed",
            error: data.error || "Failed to start job",
          }));
          return null;
        }

        const { job_id } = await res.json();
        setState((prev) => ({ ...prev, jobId: job_id, status: "pending" }));
        poll(job_id);
        return job_id;
      } catch {
        setState((prev) => ({
          ...prev,
          status: "failed",
          error: "Network error — could not start job",
        }));
        return null;
      }
    },
    [poll, stopPolling]
  );

  const reset = useCallback(() => {
    stopPolling();
    setState({
      jobId: null,
      status: "idle",
      progress: null,
      result: null,
      error: null,
    });
  }, [stopPolling]);

  return {
    ...state,
    isRunning: state.status === "pending" || state.status === "running",
    start,
    reset,
  };
}
