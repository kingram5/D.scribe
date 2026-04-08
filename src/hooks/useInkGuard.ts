"use client";

import { useState, useCallback } from "react";

/**
 * Hook to intercept 402 "out_of_ink" responses and trigger upgrade modal.
 * Wrap any fetch call with guardedFetch to auto-detect Ink depletion.
 */
export function useInkGuard() {
  const [showUpgrade, setShowUpgrade] = useState(false);

  const guardedFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await fetch(input, init);
    if (res.status === 402) {
      const body = await res.clone().json().catch(() => ({}));
      if (body.error === "out_of_ink") {
        setShowUpgrade(true);
        return res;
      }
    }
    return res;
  }, []);

  return {
    showUpgrade,
    setShowUpgrade,
    guardedFetch,
  };
}
