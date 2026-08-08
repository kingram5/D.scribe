"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import GlassCard from "@/components/ui/GlassCard";
import PageShell from "@/components/ui/PageShell";
import { AUDIENCES } from "@/lib/audience-profiles";

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--ds-input-bg)",
  border: "1px solid var(--ds-input-border)",
  borderRadius: "var(--radius-sm)",
  padding: "12px 16px",
  fontSize: 16,
  color: "var(--text-primary)",
  outline: "none",
};

export default function NewProject() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!audience) return;
    setSubmitting(true);

    const res = await fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title || "Untitled Project",
        description: "",
        audience,
      }),
    });

    if (res.ok) {
      const project = await res.json();
      router.push(`/project/${project.id}/upload`);
    } else {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <div className="paper-theme" style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 24px" }}>
        <GlassCard style={{ maxWidth: 480, width: "100%", padding: 48 }}>
          <div style={{ fontSize: 11, fontFamily: "var(--font-manrope), sans-serif", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 12 }}>New Project</div>
          <h1 style={{ fontSize: 36, fontWeight: 400, fontStyle: "italic", letterSpacing: "-0.01em", color: "var(--text-primary)", marginBottom: 8, fontFamily: "var(--font-lora), serif" }}>
            Start a new project
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 32 }}>
            Give it a name, or leave blank — you can always change it later.
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Sunday Sermons Vol. 1"
                style={inputStyle}
                autoFocus
              />
            </div>

            <div>
              <div style={{ fontSize: 11, fontFamily: "var(--font-manrope), sans-serif", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 10 }}>
                Who is this book for?
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {AUDIENCES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAudience(a)}
                    style={{
                      padding: "8px 14px",
                      minHeight: 36,
                      borderRadius: 9999,
                      fontSize: 13,
                      fontFamily: "var(--font-manrope), sans-serif",
                      fontWeight: audience === a ? 600 : 400,
                      background: audience === a ? "#C17A47" : "transparent",
                      color: audience === a ? "#fff" : "var(--text-secondary)",
                      border: audience === a ? "1px solid #C17A47" : "1px solid var(--ds-input-border)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
                Your AI collaborator specializes the whole process around this reader, starting with the brainstorm. You can change it later on the Structure step.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting || !audience}
              className="nodum-btn"
              style={{ width: "100%", justifyContent: "center", opacity: submitting || !audience ? 0.5 : 1 }}
            >
              {submitting ? "Creating..." : audience ? "Create & Upload Audio →" : "Pick your reader to continue"}
            </button>
          </form>
        </GlassCard>
      </div>
    </PageShell>
  );
}
