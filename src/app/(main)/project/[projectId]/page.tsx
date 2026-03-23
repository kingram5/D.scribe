"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Project, AudioUpload, Transcript, KeyPoint, Chapter } from "@/types";
import GlassCard from "@/components/ui/GlassCard";
import DataPill from "@/components/ui/DataPill";
import PanelTitle from "@/components/ui/PanelTitle";
import MenuSection from "@/components/ui/MenuSection";
import StepBlock from "@/components/ui/StepBlock";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import { STATUS_COLORS } from "@/lib/constants";

interface ProjectDetail extends Project {
  audio_uploads: AudioUpload[];
  transcripts: Transcript[];
  key_points: KeyPoint[];
  chapters: Chapter[];
}

const steps = [
  { key: "upload", label: "Upload Audio", icon: "1" },
  { key: "transcribe", label: "Transcribe", icon: "2" },
  { key: "analyze", label: "Analyze", icon: "3" },
  { key: "outline", label: "Outline", icon: "4" },
  { key: "generate", label: "Generate", icon: "5" },
  { key: "export", label: "Export", icon: "6" },
];

function getActiveStep(p: ProjectDetail): number {
  if (p.chapters.some((c) => c.status === "generated" || c.status === "edited")) return 5;
  if (p.chapters.length > 0) return 4;
  if (p.key_points.length > 0) return 3;
  if (p.transcripts.length > 0) return 2;
  if (p.audio_uploads.length > 0) return 1;
  return 0;
}

const STEP_DESCS = [
  "Upload sermon or lecture audio files",
  "Transcribe audio to text with speaker labels",
  "Extract key points, voice profile, mind map",
  "Organize content into chapter structure",
  "Generate manuscript content with AI",
  "Edit, review and export your manuscript",
];

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        setProject(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <PageShell>
        <Spinner />
      </PageShell>
    );
  }

  if (!project) {
    return (
      <PageShell>
        <EmptyState message="Project not found" />
      </PageShell>
    );
  }

  const activeStep = getActiveStep(project);

  const stepLinks: Record<string, string> = {
    upload: `/project/${projectId}/upload`,
    transcribe: `/project/${projectId}/transcript`,
    analyze: `/project/${projectId}/analysis`,
    outline: `/project/${projectId}/analysis`,
    generate: `/project/${projectId}/generate`,
    export: `/project/${projectId}/export`,
  };

  const stepStatuses: Array<"active" | "complete" | "locked"> = steps.map((_, i) => {
    if (i < activeStep) return "complete";
    if (i === activeStep) return "active";
    return "locked";
  });

  const totalWordCount = project.transcripts.reduce((sum, t) => sum + t.word_count, 0);

  return (
    <PageShell>
      <div className="ds-pipeline-grid" style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr 320px",
        gap: 32,
        padding: "0 40px 40px",
      }}>
        {/* Left panel */}
        <GlassCard style={{ padding: 24, alignSelf: "start" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#191816", marginBottom: 16, lineHeight: 1.3 }}>
            {project.title}
          </h2>
          {project.description && (
            <p style={{ fontSize: 13, color: "#7a7369", marginBottom: 16, lineHeight: 1.5 }}>{project.description}</p>
          )}
          <MenuSection
            items={[
              { label: project.audience, statusDot: "#a0978a", nested: false },
              { label: project.status.replace("_", " "), statusDot: STATUS_COLORS[project.status] || "#a0978a" },
              { label: new Date(project.updated_at).toLocaleDateString() },
            ]}
          />
          {project.voice_profile && (
            <div style={{ marginTop: 8 }}>
              <MenuSection items={[{ label: "Voice profiled", statusDot: "#d4b895" }]} />
            </div>
          )}
          <div style={{ marginTop: "auto", paddingTop: 16 }}>
            <button
              onClick={async () => {
                if (!confirm("Delete this project?")) return;
                await fetch(`/api/project/${projectId}`, { method: "DELETE" });
                router.push("/dashboard");
              }}
              className="nodum-btn-ghost"
              style={{ width: "100%", justifyContent: "center", color: "#dc2626", borderColor: "rgba(220,38,38,0.3)" }}
            >
              Delete Project
            </button>
          </div>
        </GlassCard>

        {/* Center: pipeline steps */}
        <div>
          <h1 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, color: "#a0978a", marginBottom: 20 }}>
            Pipeline
          </h1>
          {steps.map((step, i) => (
            <StepBlock
              key={step.key}
              num={`0${i + 1} — ${step.label.toUpperCase()}`}
              title={step.label}
              desc={STEP_DESCS[i]}
              status={stepStatuses[i]}
              href={stepStatuses[i] !== "locked" ? stepLinks[step.key] : undefined}
            />
          ))}
        </div>

        {/* Right panel: stats */}
        <GlassCard style={{ padding: 24, alignSelf: "start" }}>
          <PanelTitle>Stats</PanelTitle>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <DataPill
              label="Audio Files"
              metric={String(project.audio_uploads.length)}
              accentColor="#E05D3A"
            />
            <DataPill
              label="Words Transcribed"
              metric={totalWordCount.toLocaleString()}
              accentColor="#F07153"
            />
            <DataPill
              label="Key Points"
              metric={String(project.key_points.length)}
              accentColor="#7a7369"
            />
            <DataPill
              label="Chapters"
              metric={String(project.chapters.length)}
              accentColor="#a0978a"
            />
          </div>

          {/* Pipeline completion */}
          {(() => {
            const completedSteps = stepStatuses.filter(s => s === "complete").length;
            const totalSteps = stepStatuses.length;
            const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
            return (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "#a0978a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Progress
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? "#059669" : "#191816" }}>
                    {pct}%
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    borderRadius: 3,
                    background: pct === 100 ? "#059669" : "#E05D3A",
                    width: `${pct}%`,
                    transition: "width 0.4s ease",
                  }} />
                </div>
              </div>
            );
          })()}
        </GlassCard>
      </div>
    </PageShell>
  );
}
