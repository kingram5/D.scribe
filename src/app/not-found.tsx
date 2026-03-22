import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #FDFCF9 0%, #F4F1EB 100%)",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          padding: 48,
          background: "rgba(255,255,255,0.7)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.9)",
          borderRadius: 20,
          boxShadow: "0 24px 64px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        {/* D. scribe logo mark */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 6,
            background: "#1A1816",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-lora), serif",
              fontSize: 20,
              fontWeight: 500,
              color: "#FDFCF9",
            }}
          >
            D.
          </span>
        </div>

        {/* 404 in the brand's serif italic style */}
        <div
          style={{
            fontFamily: "var(--font-lora), serif",
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: 64,
            color: "rgba(26,24,22,0.12)",
            lineHeight: 1,
            marginBottom: 16,
          }}
        >
          404
        </div>

        <h1
          style={{
            fontFamily: "var(--font-manrope), sans-serif",
            fontSize: 22,
            fontWeight: 700,
            color: "#191816",
            marginBottom: 8,
            letterSpacing: "-0.02em",
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            fontFamily: "var(--font-manrope), sans-serif",
            fontSize: 14,
            color: "#7a7369",
            lineHeight: 1.6,
            marginBottom: 32,
          }}
        >
          The page you&apos;re looking for doesn&apos;t exist or may have been
          moved.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link
            href="/dashboard"
            style={{
              display: "block",
              padding: "13px 20px",
              fontSize: 14,
              fontWeight: 600,
              color: "#FDFCF9",
              background: "#1A1816",
              border: "none",
              borderRadius: 100,
              textDecoration: "none",
              transition: "opacity 0.15s",
            }}
          >
            Go to Dashboard
          </Link>

          <Link
            href="/"
            style={{
              display: "block",
              padding: "13px 20px",
              fontSize: 14,
              fontWeight: 600,
              color: "#191816",
              background: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(25,24,22,0.12)",
              borderRadius: 100,
              textDecoration: "none",
              transition: "background 0.15s",
            }}
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
