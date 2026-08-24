"use client";

import { useState } from "react";
import { startTopupCheckout } from "@/lib/start-topup-checkout";
import type { TopupSku } from "@/lib/topups";

export default function AddMoreButton({
  sku,
  label = "Add more",
}: {
  sku: TopupSku;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await startTopupCheckout(sku);
        } catch {
          setBusy(false);
        }
      }}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        fontSize: 11,
        fontWeight: 600,
        color: "var(--ds-accent-500, #C17A47)",
        cursor: busy ? "wait" : "pointer",
        fontFamily: "var(--font-manrope), sans-serif",
      }}
    >
      {busy ? "Opening…" : label}
    </button>
  );
}
