"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "../cinematic-landing.css";

type AudienceFilter =
  | "All"
  | "General"
  | "Faith Community"
  | "Business/Leadership"
  | "Self-Help"
  | "Young Adult"
  | "Academic";

interface DiscoverBook {
  id: string;
  title: string;
  description: string;
  audience: string;
  published_excerpt: string | null;
  published_author: string | null;
  updated_at: string;
}

const AUDIENCE_FILTERS: AudienceFilter[] = [
  "All",
  "General",
  "Faith Community",
  "Business/Leadership",
  "Self-Help",
  "Young Adult",
  "Academic",
];

export default function DiscoverPage() {
  const [books, setBooks] = useState<DiscoverBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<AudienceFilter>("All");

  useEffect(() => {
    fetch("/api/discover")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setBooks(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered =
    activeFilter === "All"
      ? books
      : books.filter((b) => b.audience === activeFilter);

  return (
    <div
      className="cinematic-root relative w-full min-h-screen"
      style={{ backgroundColor: "#2C2419" }}
    >
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: "rgba(44,36,25,0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(249,247,242,0.08)",
        }}
      >
        <div
          style={{
            maxWidth: 1440,
            margin: "0 auto",
            padding: "0 48px",
            height: 72,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                background: "#C17A47",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-playfair), var(--font-lora), serif",
                  fontSize: 18,
                  paddingTop: 2,
                }}
              >
                D.
              </span>
            </div>
            <span
              style={{
                fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
                fontWeight: 600,
                fontSize: 16,
                color: "#F9F7F2",
              }}
            >
              scribe
            </span>
          </Link>
          <Link
            href="/login"
            style={{
              fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
              fontSize: 14,
              fontWeight: 500,
              color: "#A89F94",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#F9F7F2"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#A89F94"; }}
          >
            Sign in
          </Link>
        </div>
      </nav>

      <main style={{ maxWidth: 1440, margin: "0 auto", padding: "80px 48px 120px" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <h1
            style={{
              fontFamily: "var(--font-playfair), var(--font-lora), serif",
              fontSize: "clamp(36px, 5vw, 64px)",
              fontStyle: "italic",
              color: "#F9F7F2",
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            From the community
          </h1>
          <p
            style={{
              fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
              fontSize: 18,
              color: "#A89F94",
              marginTop: 16,
              fontWeight: 300,
            }}
          >
            Books written by real people, with a little help from D. scribe.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "center",
            marginBottom: 56,
          }}
        >
          {AUDIENCE_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              style={{
                padding: "8px 20px",
                borderRadius: 9999,
                border: activeFilter === f ? "1px solid #C17A47" : "1px solid rgba(249,247,242,0.12)",
                background: activeFilter === f ? "rgba(193,122,71,0.15)" : "rgba(249,247,242,0.04)",
                color: activeFilter === f ? "#C17A47" : "#A89F94",
                fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "3px solid rgba(193,122,71,0.2)",
                borderTopColor: "#C17A47",
                animation: "spin 0.8s linear infinite",
              }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <p
              style={{
                fontFamily: "var(--font-playfair), var(--font-lora), serif",
                fontSize: 22,
                fontStyle: "italic",
                color: "#A89F94",
              }}
            >
              No published books yet. Be the first.
            </p>
            <Link
              href="/login"
              style={{
                display: "inline-block",
                marginTop: 24,
                padding: "12px 32px",
                borderRadius: 9999,
                background: "#C17A47",
                color: "#F9F7F2",
                fontFamily: "var(--font-manrope), sans-serif",
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Start writing
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 28,
            }}
          >
            {filtered.map((book) => (
              <div
                key={book.id}
                className="cinematic-glass-card rounded-2xl"
                style={{ padding: 32, display: "flex", flexDirection: "column", gap: 16 }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase" as const,
                      color: "#A89F94",
                      fontFamily: "var(--font-manrope), sans-serif",
                      marginBottom: 8,
                    }}
                  >
                    {book.published_author || "Anonymous"}
                  </div>
                  <h2
                    style={{
                      fontFamily: "var(--font-playfair), var(--font-lora), serif",
                      fontSize: 22,
                      fontWeight: 600,
                      color: "#F9F7F2",
                      margin: 0,
                      lineHeight: 1.3,
                    }}
                  >
                    {book.title}
                  </h2>
                </div>

                <div>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 12px",
                      borderRadius: 9999,
                      border: "1px solid rgba(193,122,71,0.4)",
                      background: "rgba(193,122,71,0.08)",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#C17A47",
                      fontFamily: "var(--font-manrope), sans-serif",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {book.audience}
                  </span>
                </div>

                {book.published_excerpt && (
                  <p
                    style={{
                      fontFamily: "var(--font-lora), var(--font-playfair), serif",
                      fontSize: 14,
                      fontStyle: "italic",
                      color: "#A89F94",
                      lineHeight: 1.7,
                      margin: 0,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical" as const,
                      overflow: "hidden",
                    }}
                  >
                    &ldquo;{book.published_excerpt}&rdquo;
                  </p>
                )}

                <div style={{ marginTop: "auto", paddingTop: 8 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "rgba(193,122,71,0.5)",
                      fontFamily: "var(--font-manrope), sans-serif",
                      cursor: "default",
                    }}
                  >
                    Read More →
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
