"use client";
import { REF_NAME_COOKIE } from "@/lib/partner-rules";

/** The creator's display name from the readable referral cookie, or null. */
export function readReferralName(): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${REF_NAME_COOKIE}=`));
  if (!hit) return null;
  try {
    const name = decodeURIComponent(hit.slice(REF_NAME_COOKIE.length + 1)).trim();
    return name || null;
  } catch {
    return null;
  }
}

/** Fired after a code is applied so the banner updates without a reload. */
export const REFERRAL_EVENT = "ds:referral";
