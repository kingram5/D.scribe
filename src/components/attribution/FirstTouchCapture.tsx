"use client";

import { useEffect } from "react";
import { FIRST_TOUCH_KEY, VISIT_PINGED_KEY, claimVisitPing, recordFirstTouch } from "@/lib/attribution";
import { isAppPath } from "@/lib/app-routes";
import { CONSENT_EVENT, readConsent, type ConsentState } from "@/lib/consent";

/**
 * Remembers how a visitor first arrived (landing path + utm_* and the
 * referrer's origin/path) in this browser's localStorage, once, so the signup
 * question can send it along with the answer.
 *
 * The first time a browser ever visits, it also sends ONE anonymous ping
 * (referrer origin/path + utm_source/utm_medium, nothing else) so the growth
 * dashboard can count visits per channel. The server stores only a daily count
 * per channel: no IP, no id, no URL. Never repeated for the same browser. It
 * fires as the first page mounts, so a brand-new visitor is counted before
 * they answer the cookie banner (the privacy policy says so).
 *
 * Skipped inside the signed-in app, and skipped (and cleared) when the visitor
 * has already declined analytics in the cookie banner.
 */
export function FirstTouchCapture() {
  useEffect(() => {
    const onConsent = (e: Event) => {
      const c = (e as CustomEvent<ConsentState>).detail;
      if (c && c.analytics === false) {
        try {
          localStorage.removeItem(FIRST_TOUCH_KEY);
          localStorage.removeItem(VISIT_PINGED_KEY);
        } catch { /* storage blocked */ }
      }
    };
    window.addEventListener(CONSENT_EVENT, onConsent);
    try {
      const declined = readConsent()?.analytics === false;
      const touch = recordFirstTouch(localStorage, window.location.href, document.referrer, {
        analyticsDeclined: declined,
        isAppPath,
      });
      const ping = claimVisitPing(localStorage, touch, declined);
      if (ping) {
        fetch("/api/attribution/visit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ping),
          keepalive: true,
        }).catch(() => { /* fail soft: an uncounted visit is fine */ });
      }
    } catch { /* private mode or storage blocked: capture and count nothing */ }
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, []);
  return null;
}
