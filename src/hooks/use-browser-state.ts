"use client";

import { useCallback, useSyncExternalStore } from "react";

const subscribeClient = () => () => {};
/** A stable server snapshot prevents browser-only state from changing hydration. */
export function useClientReady() {
  return useSyncExternalStore(subscribeClient, () => true, () => false);
}

export function useMediaQuery(query: string) {
  const subscribe = useCallback((notify: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", notify);
    return () => media.removeEventListener("change", notify);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

const STORAGE_EVENT = "ds:browser-storage";
export function writeSessionValue(key: string, value: string) {
  sessionStorage.setItem(key, value);
  window.dispatchEvent(new Event(STORAGE_EVENT));
}
export function useSessionValue(key: string) {
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    window.addEventListener(STORAGE_EVENT, notify);
    return () => {
      window.removeEventListener("storage", notify);
      window.removeEventListener(STORAGE_EVENT, notify);
    };
  }, []);
  return useSyncExternalStore(subscribe, () => {
    try { return sessionStorage.getItem(key) ?? ""; } catch { return ""; }
  }, () => "");
}

export function useLocalValue(key: string) {
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    return () => window.removeEventListener("storage", notify);
  }, []);
  return useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
  }, () => "");
}
