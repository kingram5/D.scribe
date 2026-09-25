"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { readReferralName, REFERRAL_EVENT } from "./referral-cookie";
import { PARTNER_BONUS_INK, PARTNER_DISCOUNT_PERCENT } from "@/lib/partner-rules";

// A slim ribbon on the public pages for visitors who arrived through a creator's
// link or typed their code: says who sent them and what they get.
const SHOW_ON = new Set(["/", "/pricing", "/login", "/about"]);

export function ReferralBanner() {
  const pathname = usePathname();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setName(readReferralName());
    read();
    window.addEventListener(REFERRAL_EVENT, read);
    return () => window.removeEventListener(REFERRAL_EVENT, read);
  }, []);

  if (!name || !SHOW_ON.has(pathname ?? "")) return null;
  return (
    <div
      role="status"
      style={{
        position: "relative",
        zIndex: 60,
        background: "#C17A47",
        color: "#1B150F",
        textAlign: "center",
        padding: "9px 16px",
        fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
        fontSize: 14,
        lineHeight: 1.4,
      }}
    >
      <strong>{name}</strong> sent you: {PARTNER_BONUS_INK} free Ink to start writing + {PARTNER_DISCOUNT_PERCENT}% off your first month.
    </div>
  );
}
