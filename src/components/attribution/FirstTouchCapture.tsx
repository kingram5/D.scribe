"use client";

import { useEffect } from "react";
import { FIRST_TOUCH_KEY, recordFirstTouch } from "@/lib/attribution";
import { isAppPath } from "@/lib/app-routes";
import { CONSENT_EVENT, readConsent, type ConsentState } from "@/lib/consent";

/**
 * Remembers how a visitor first arrived (landing path + utm_* and the
 * referrer's origin/path) in this browser's localStorage, once, so the signup
 * question can send it along. Nothing leaves the device until the person signs
 * up and answers. Skipped inside the signed-in app, and skipped (and cleared)
 * when the visitor has declined analytics in the cookie banner.
 */
export function FirstTouchCapture() {
  useEffect(() => {
    const onConsent = (e: Event) => {
      const c = (e as CustomEvent<ConsentState>).detail;
      if (c && c.analytics === false) {
        try { localStorage.removeItem(FIRST_TOUCH_KEY); } catch { /* storage blocked */ }
      }
    };
    window.addEventListener(CONSENT_EVENT, onConsent);
    try {
      recordFirstTouch(localStorage, window.location.href, document.referrer, {
        analyticsDeclined: readConsent()?.analytics === false,
        isAppPath,
      });
    } catch { /* private mode or storage blocked: capture nothing */ }
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, []);
  return null;
}
