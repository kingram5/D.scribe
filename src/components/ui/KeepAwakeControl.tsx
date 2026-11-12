"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createScreenWakeLock, type WakeStatus } from "@/lib/screen-wake-lock";

const SETTING = "ds_keep_awake_v1";
const SETTING_CHANGED = "ds-keep-awake-setting";
const serverEnabled = () => true;
const serverSupported = () => null;
const readEnabled = () => {
  try { return localStorage.getItem(SETTING) !== "false"; } catch { return true; }
};
const readSupported = () => window.isSecureContext && "wakeLock" in navigator;
const subscribeSupport = () => () => {};
function subscribeSetting(changed: () => void) {
  window.addEventListener("storage", changed);
  window.addEventListener(SETTING_CHANGED, changed);
  return () => {
    window.removeEventListener("storage", changed);
    window.removeEventListener(SETTING_CHANGED, changed);
  };
}

export default function KeepAwakeControl({ running }: { running: boolean }) {
  const storedEnabled = useSyncExternalStore(subscribeSetting, readEnabled, serverEnabled);
  const [visitEnabled, setVisitEnabled] = useState<boolean | null>(null);
  const enabled = visitEnabled ?? storedEnabled;
  const supported = useSyncExternalStore<boolean | null>(subscribeSupport, readSupported, serverSupported);
  const [status, setStatus] = useState<WakeStatus>("idle");
  const controller = useRef<ReturnType<typeof createScreenWakeLock> | null>(null);

  useEffect(() => {
    if (supported !== true) return;
    const owner = createScreenWakeLock({
      request: () => navigator.wakeLock.request("screen"),
      visible: () => document.visibilityState === "visible",
      onStatus: setStatus,
    });
    controller.current = owner;
    const changed = () => owner.visibilityChanged();
    document.addEventListener("visibilitychange", changed);
    window.addEventListener("pageshow", changed);
    return () => {
      controller.current = null;
      owner.dispose();
      document.removeEventListener("visibilitychange", changed);
      window.removeEventListener("pageshow", changed);
    };
  }, [supported]);

  useEffect(() => {
    if (supported === true) controller.current?.setWanted(enabled && running);
  }, [enabled, running, supported]);

  const message = supported === false
    ? "Keep-awake isn’t available in this browser. Keep this page open and prevent your phone from locking."
    : !enabled
      ? "Keep-awake is off. Keep this page open during the run."
      : status === "active"
        ? "Screen kept awake while this step runs. Keep this page open; manually locking your phone can interrupt it."
        : status === "requesting"
          ? "Requesting keep-awake…"
          : running && (status === "released" || status === "unavailable")
            ? "Your phone isn’t being kept awake. Keep this page open; check battery-saving settings and try again."
            : "Your screen will stay awake during long-running steps, then return to normal when they finish.";

  return (
    <div style={{ padding: "8px 0", color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, cursor: supported === false ? "default" : "pointer", color: "var(--text-primary)" }}>
        <input type="checkbox" checked={enabled} disabled={supported !== true} onChange={(event) => {
          const next = event.target.checked;
          try {
            localStorage.setItem(SETTING, String(next));
            setVisitEnabled(null);
            window.dispatchEvent(new Event(SETTING_CHANGED));
          } catch { setVisitEnabled(next); }
        }} style={{ width: 20, height: 20, accentColor: "#C17A47" }} />
        Keep screen awake during long-running steps
      </label>
      <p role="status" aria-live="polite" style={{ margin: "0 0 0 30px" }}>{message}</p>
      {supported && enabled && running && (status === "released" || status === "unavailable") && (
        <button type="button" onClick={() => controller.current?.retry()} style={{ minHeight: 44, padding: "8px 14px", margin: "4px 0 0 30px", borderRadius: 8, border: "1px solid var(--ds-input-border)", background: "transparent", color: "var(--text-primary)", cursor: "pointer" }}>Try keep-awake again</button>
      )}
    </div>
  );
}
