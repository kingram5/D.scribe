"use client";
import { useCredits } from "@/hooks/useCredits";

export default function CreditBadge() {
  const { balance, isLow, isEmpty } = useCredits();

  if (balance === null) return null;

  const bgColor = isEmpty
    ? "rgba(220,38,38,0.1)"
    : isLow
      ? "rgba(245,158,11,0.1)"
      : "rgba(255,255,255,0.6)";

  const textColor = isEmpty
    ? "#dc2626"
    : isLow
      ? "#d97706"
      : "#7a7369";

  const borderColor = isEmpty
    ? "rgba(220,38,38,0.2)"
    : isLow
      ? "rgba(245,158,11,0.2)"
      : "rgba(255,255,255,0.8)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        borderRadius: 100,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "var(--font-manrope), sans-serif",
        color: textColor,
        whiteSpace: "nowrap",
      }}
      title={`${balance} credits remaining`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
      {balance}
    </div>
  );
}
