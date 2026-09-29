"use client";

/**
 * The fork after the first draft (flow v2, Kyle 9/28): an optional
 * publisher-ready review, or straight to the final draft. `floating` is the
 * one-time pop-up when the last chapter lands; inline is the same choice kept
 * on the page afterwards.
 */
export default function ReviewChoice({
  onReview, onFinal, onDismiss, floating = false, disabled = false,
}: {
  onReview: () => void;
  onFinal: () => void;
  onDismiss?: () => void;
  floating?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      role={floating ? "dialog" : undefined}
      aria-label={floating ? "Your first draft is done" : undefined}
      style={{
        ...(floating
          ? {
              position: "fixed" as const, left: "50%", bottom: 28, transform: "translateX(-50%)", zIndex: 160,
              width: "min(520px, calc(100vw - 32px))", boxShadow: "0 18px 50px rgba(0,0,0,0.3)",
              animation: "dsChoiceIn 0.3s ease",
            }
          : {}),
        padding: "20px 22px", borderRadius: 14, background: "var(--ds-paper, #FDFCF8)",
        border: "1px solid rgba(193,122,71,0.35)", display: "grid", gap: 12,
      }}
    >
      {floating && <style>{`@keyframes dsChoiceIn { from { opacity: 0; transform: translate(-50%, 12px) } to { opacity: 1; transform: translate(-50%, 0) } }`}</style>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontFamily: "var(--font-lora), serif", fontSize: 19, fontWeight: 600, color: "var(--text-primary)" }}>
          Your first draft is done
        </div>
        {onDismiss && (
          <button type="button" onClick={onDismiss} aria-label="Close" style={{ border: "none", background: "transparent", color: "var(--text-secondary)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)" }}>
        Want it publisher-ready? An editor reads every chapter, then T.H.E.O. interviews you about what only you know, and your answers go into the book.
        {" "}<strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>It&apos;s optional.</strong> It&apos;s only for publisher-ready edits and additions; skip it and go straight to your final draft.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button type="button" onClick={onReview} disabled={disabled} style={{
          fontSize: 14, fontWeight: 600, padding: "11px 18px", borderRadius: 10, border: "none",
          background: "var(--ds-accent-500, #C17A47)", color: "#fff", cursor: disabled ? "wait" : "pointer",
        }}>
          Send to publisher-ready review
        </button>
        <button type="button" onClick={onFinal} disabled={disabled} style={{
          fontSize: 14, fontWeight: 600, padding: "11px 18px", borderRadius: 10, border: "1px solid var(--ds-card-border)",
          background: "transparent", color: "var(--text-primary)", cursor: disabled ? "wait" : "pointer",
        }}>
          Proceed to final draft editor
        </button>
      </div>
    </div>
  );
}
