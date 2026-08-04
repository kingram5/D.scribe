"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function openBilling() {
    setBillingLoading(true);
    setBillingError("");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't open billing.");
      window.location.href = data.url;
    } catch (e) {
      setBillingError(e instanceof Error ? e.message : "Couldn't open billing.");
      setBillingLoading(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Account deletion failed.");
      }
      await signOut();
      router.replace("/");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Account deletion failed.");
      setDeleting(false);
    }
  }

  const card: React.CSSProperties = {
    background: "rgba(28,22,16,0.4)",
    border: "1px solid rgba(249,247,242,0.12)",
    borderRadius: 16,
    padding: 28,
    marginBottom: 20,
  };
  const h2: React.CSSProperties = {
    fontFamily: "var(--font-manrope), sans-serif",
    fontSize: 16,
    fontWeight: 700,
    color: "#F9F7F2",
    marginBottom: 6,
  };
  const sub: React.CSSProperties = { fontSize: 13, color: "#A89F94", lineHeight: 1.6, marginBottom: 16 };

  return (
    <div style={{ minHeight: "100%", background: "#2C2419", overflowY: "auto" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "112px 24px 64px", fontFamily: "var(--font-manrope), sans-serif" }}>
        <h1 style={{ fontFamily: "var(--font-lora), serif", fontSize: 36, color: "#F9F7F2", marginBottom: 28 }}>
          Settings
        </h1>

        {/* Account */}
        <div style={card}>
          <h2 style={h2}>Account</h2>
          <p style={sub}>Signed in as <strong style={{ color: "#F9F7F2" }}>{user?.email}</strong>.</p>
          <button onClick={signOut} style={btn()}>Sign out</button>
        </div>

        {/* Billing */}
        <div style={card}>
          <h2 style={h2}>Billing</h2>
          <p style={sub}>Manage your subscription, payment method, and invoices in the Stripe customer portal.</p>
          {billingError && <p style={{ fontSize: 12.5, color: "#E5896B", marginBottom: 12 }}>{billingError}</p>}
          <button onClick={openBilling} disabled={billingLoading} style={btn()}>
            {billingLoading ? "Opening…" : "Manage billing"}
          </button>
        </div>

        {/* Danger zone */}
        <div style={{ ...card, border: "1px solid rgba(220,38,38,0.35)" }}>
          <h2 style={{ ...h2, color: "#F0A3A3" }}>Delete account</h2>
          <p style={sub}>
            Permanently deletes your account, all projects and audio, and cancels any subscription.
            <strong style={{ color: "#F0A3A3" }}> This cannot be undone.</strong> Type <strong style={{ color: "#F9F7F2" }}>DELETE</strong> to confirm.
          </p>
          {deleteError && <p style={{ fontSize: 12.5, color: "#E5896B", marginBottom: 12 }}>{deleteError}</p>}
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 16,
              border: "1px solid rgba(249,247,242,0.18)",
              borderRadius: 8,
              background: "rgba(0,0,0,0.2)",
              color: "#F9F7F2",
              marginBottom: 14,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={deleteAccount}
            disabled={confirmText !== "DELETE" || deleting}
            style={{
              ...btn(),
              background: "#dc2626",
              color: "#fff",
              border: "none",
              opacity: confirmText !== "DELETE" || deleting ? 0.5 : 1,
              cursor: confirmText !== "DELETE" || deleting ? "not-allowed" : "pointer",
            }}
          >
            {deleting ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </div>
    </div>
  );
}

function btn(): React.CSSProperties {
  return {
    padding: "10px 18px",
    fontSize: 13.5,
    fontWeight: 600,
    borderRadius: 9,
    border: "1px solid rgba(249,247,242,0.2)",
    background: "rgba(249,247,242,0.06)",
    color: "#F9F7F2",
    cursor: "pointer",
  };
}
