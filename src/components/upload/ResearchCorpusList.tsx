"use client";

import { useEffect, useState } from "react";

interface ResearchRow {
  id: string;
  text: string;
  attribution: string | null;
  source_title: string;
  source_url: string;
  source_date: string | null;
}

export default function ResearchCorpusList({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ResearchRow[] | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/research/items?project_id=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : { enabled: false, items: [] }))
      .then((d) => {
        if (cancelled) return;
        setEnabled(!!d.enabled);
        setItems(Array.isArray(d.items) ? d.items : []);
      })
      .catch(() => {
        if (!cancelled) {
          setEnabled(false);
          setItems([]);
        }
      });
    return () => { cancelled = true; };
  }, [projectId]);

  async function dismiss(id: string) {
    setItems((prev) => (prev ?? []).filter((item) => item.id !== id));
    try {
      const res = await fetch(`/api/research/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      if (!res.ok) throw new Error("dismiss failed");
    } catch {
      const res = await fetch(`/api/research/items?project_id=${encodeURIComponent(projectId)}`);
      if (res.ok) {
        const d = await res.json();
        setItems(Array.isArray(d.items) ? d.items : []);
      }
    }
  }

  if (!enabled || !items || items.length === 0) return null;

  return (
    <section
      aria-label="T.H.E.O's research"
      style={{
        marginTop: 28,
        padding: "18px 4px 0",
        borderTop: "1px solid rgba(44,36,25,0.08)",
      }}
    >
      <h2 style={{
        fontFamily: "var(--font-manrope), sans-serif",
        fontSize: 13,
        fontWeight: 700,
        color: "var(--ds-ink)",
        margin: "0 0 12px",
      }}>
        T.H.E.O&apos;s research
      </h2>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.55)",
              border: "1px solid rgba(44,36,25,0.08)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.45,
                color: "var(--text-primary)",
                fontFamily: "var(--font-manrope), sans-serif",
              }}>
                {item.text.length > 180 ? `${item.text.slice(0, 177)}…` : item.text}
              </p>
              <p style={{
                margin: "6px 0 0",
                fontSize: 11,
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-manrope), sans-serif",
              }}>
                {item.attribution ? `${item.attribution} · ` : ""}
                <a href={item.source_url} target="_blank" rel="noreferrer" style={{ color: "#C17A47" }}>
                  {item.source_title}
                </a>
                {item.source_date ? ` · ${item.source_date}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss this research"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-tertiary)",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
                padding: 2,
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
