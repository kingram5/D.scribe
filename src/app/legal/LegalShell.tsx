import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

/**
 * Shared layout + typography primitives for the public /legal/* pages.
 *
 * These pages hand-convert the markdown drafts in docs/legal/ into semantic
 * JSX (no markdown renderer is installed, and adding one would require new
 * build config). Server-rendered — no "use client".
 *
 * The visual language matches the public marketing pages (pricing, blog):
 * warm-editorial dark theme, serif italic headings, sans-serif body.
 */

const COLORS = {
  bg: "#2C2419",
  ink: "#F9F7F2",
  body: "#C8C0B4",
  muted: "#A89F94",
  faint: "#7A7358",
  accent: "#C17A47",
  divider: "rgba(249,247,242,0.08)",
} as const;

const SANS = "var(--font-inter), var(--font-manrope), sans-serif";
const SERIF = "var(--font-playfair), var(--font-lora), serif";
const MONO = "var(--font-geist-mono), monospace";

export const LEGAL_PAGES = [
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/dmca", label: "DMCA Policy" },
  { href: "/legal/acceptable-use", label: "Acceptable Use" },
] as const;

/** Section heading (## in markdown). */
export function H2({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: SERIF,
        fontSize: "clamp(22px, 3vw, 28px)",
        fontWeight: 400,
        fontStyle: "italic",
        color: COLORS.ink,
        lineHeight: 1.25,
        margin: "44px 0 16px",
      }}
    >
      {children}
    </h2>
  );
}

/** Sub-heading (### in markdown). */
export function H3({ children }: { children: ReactNode }) {
  return (
    <h3
      style={{
        fontFamily: SANS,
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: "0.01em",
        color: COLORS.ink,
        margin: "28px 0 10px",
      }}
    >
      {children}
    </h3>
  );
}

/** Body paragraph. */
export function P({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p
      style={{
        fontFamily: SANS,
        fontSize: 16,
        lineHeight: 1.8,
        color: COLORS.body,
        margin: "0 0 16px",
        ...style,
      }}
    >
      {children}
    </p>
  );
}

/** Bulleted list. Pass an array of nodes; each becomes an <li>. */
export function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul
      style={{
        listStyle: "disc",
        paddingLeft: 24,
        margin: "0 0 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            fontFamily: SANS,
            fontSize: 16,
            lineHeight: 1.7,
            color: COLORS.body,
          }}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Emphasised inline label (**bold** in markdown). */
export function Strong({ children }: { children: ReactNode }) {
  return <strong style={{ color: COLORS.ink, fontWeight: 700 }}>{children}</strong>;
}

/** Legal-style ALL-CAPS clause block (e.g. disclaimers / liability caps). */
export function Clause({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontFamily: SANS,
        fontSize: 13.5,
        lineHeight: 1.7,
        letterSpacing: "0.01em",
        color: COLORS.muted,
        margin: "0 0 16px",
      }}
    >
      {children}
    </p>
  );
}

/** Italic "draft note" / editorial aside rendered at the foot of a doc. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontFamily: SANS,
        fontSize: 13.5,
        lineHeight: 1.7,
        fontStyle: "italic",
        color: COLORS.faint,
        margin: "8px 0 0",
      }}
    >
      {children}
    </p>
  );
}

export function LegalShell({
  title,
  subtitle,
  lastUpdated,
  currentPath,
  children,
}: {
  title: string;
  /** Short summary line shown under the title (optional). */
  subtitle?: string;
  /** Human-readable date string, e.g. "June 1, 2026". */
  lastUpdated: string;
  /** The route of the current page, used to de-emphasise its own cross-link. */
  currentPath: string;
  children: ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: COLORS.bg, color: COLORS.ink }}>
      {/* Ambient glow — purely decorative, matches marketing pages */}
      <div
        style={{
          position: "fixed",
          top: "10%",
          right: "5%",
          width: "30vw",
          height: "30vw",
          background: "rgba(193,122,71,0.06)",
          borderRadius: "50%",
          filter: "blur(100px)",
          pointerEvents: "none",
        }}
      />

      {/* Nav */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          borderBottom: `1px solid ${COLORS.divider}`,
          background: "rgba(44,36,25,0.9)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 24px",
            height: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: COLORS.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontFamily: SERIF,
                fontSize: 20,
                paddingTop: 2,
              }}
            >
              D.
            </div>
            <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 18, color: COLORS.ink }}>scribe</span>
          </Link>
          <Link
            href="/login"
            style={{
              fontFamily: SANS,
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.ink,
              background: COLORS.accent,
              padding: "10px 24px",
              borderRadius: 9999,
              textDecoration: "none",
            }}
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Article */}
      <article style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px 96px", position: "relative", zIndex: 10 }}>
        <p
          style={{
            fontFamily: SANS,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: COLORS.accent,
            margin: "0 0 16px",
          }}
        >
          Legal
        </p>

        <h1
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(30px, 5vw, 46px)",
            fontWeight: 400,
            fontStyle: "italic",
            color: COLORS.ink,
            lineHeight: 1.15,
            margin: "0 0 16px",
          }}
        >
          {title}
        </h1>

        {subtitle && (
          <p style={{ fontFamily: SANS, fontSize: 17, color: COLORS.muted, lineHeight: 1.6, margin: "0 0 16px" }}>
            {subtitle}
          </p>
        )}

        <p style={{ fontFamily: MONO, fontSize: 12.5, color: COLORS.faint, margin: "0 0 8px" }}>
          Last updated: {lastUpdated}
        </p>

        <div style={{ height: 1, background: COLORS.divider, margin: "32px 0 40px" }} />

        {children}

        {/* Cross-links to the other legal documents */}
        <div style={{ height: 1, background: COLORS.divider, margin: "56px 0 28px" }} />
        <p
          style={{
            fontFamily: SANS,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: COLORS.accent,
            margin: "0 0 14px",
          }}
        >
          More legal
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px" }}>
          {LEGAL_PAGES.map((page) => {
            const isCurrent = page.href === currentPath;
            return isCurrent ? (
              <span
                key={page.href}
                aria-current="page"
                style={{ fontFamily: SANS, fontSize: 14, color: COLORS.faint }}
              >
                {page.label}
              </span>
            ) : (
              <Link
                key={page.href}
                href={page.href}
                style={{ fontFamily: SANS, fontSize: 14, color: COLORS.muted, textDecoration: "none" }}
              >
                {page.label}
              </Link>
            );
          })}
        </div>
      </article>
    </div>
  );
}
