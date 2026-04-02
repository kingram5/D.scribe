export default function UnauthorizedPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #FDFCF9 0%, #F4F1EB 100%)",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        padding: 48,
        background: "rgba(255,255,255,0.7)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.9)",
        borderRadius: 20,
        boxShadow: "0 24px 64px rgba(0,0,0,0.08)",
        textAlign: "center" as const,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: "#1A1816", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "var(--font-lora), serif", fontSize: 18, fontWeight: 500, color: "#FDFCF9" }}>D.</span>
          </div>
          <span style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "#1A1816" }}>
            scribe
          </span>
        </div>

        <h1 style={{
          fontFamily: "var(--font-manrope), sans-serif",
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: "#1A1816",
          marginBottom: 12,
        }}>
          Beta Access Only
        </h1>
        <p style={{
          fontSize: 15,
          color: "#7a7369",
          lineHeight: 1.6,
          marginBottom: 32,
        }}>
          D.Scribe is currently in closed beta. If you&apos;ve been invited, make sure you&apos;re signing in with the email address we have on file.
        </p>

        <a
          href="/login"
          style={{
            display: "inline-block",
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 600,
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            background: "white",
            color: "#191816",
            textDecoration: "none",
          }}
        >
          Try a different account
        </a>
      </div>
    </div>
  );
}
