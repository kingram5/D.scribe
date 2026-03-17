"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Audience } from "@/types";
import GlassCard from "@/components/ui/GlassCard";
import PageShell from "@/components/ui/PageShell";

const audiences: Audience[] = [
  "General",
  "Academic",
  "Faith Community",
  "Business/Leadership",
  "Self-Help",
  "Young Adult",
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(255,255,255,0.6)",
  border: "1px solid rgba(0,0,0,0.1)",
  borderRadius: "var(--radius-sm)",
  padding: "10px 14px",
  fontSize: 14,
  color: "#191816",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase" as const,
  fontWeight: 600,
  color: "#a0978a",
  letterSpacing: "0.08em",
  display: "block",
  marginBottom: 8,
};

export default function NewProject() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<Audience>("General");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const res = await fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title || "Untitled Project",
        description,
        audience,
      }),
    });

    if (res.ok) {
      const project = await res.json();
      router.push(`/project/${project.id}`);
    } else {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 24px" }}>
        <GlassCard style={{ maxWidth: 560, width: "100%", padding: 48 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "#191816", marginBottom: 32 }}>
            New Project
          </h1>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <label style={labelStyle}>Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Sunday Sermons Vol. 1"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this book about?"
                rows={3}
                style={{ ...inputStyle, resize: "none" }}
              />
            </div>

            <div>
              <label style={labelStyle}>Target Audience</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {audiences.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAudience(a)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--radius-pill)",
                      border: "1px solid",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      background: audience === a ? "#191816" : "transparent",
                      color: audience === a ? "white" : "#191816",
                      borderColor: audience === a ? "#191816" : "rgba(25,24,22,0.2)",
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="nodum-btn"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {submitting ? "Creating..." : "Create Project"}
            </button>
          </form>
        </GlassCard>
      </div>
    </PageShell>
  );
}
