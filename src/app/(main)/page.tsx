"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Project } from "@/types";
import GlassCard from "@/components/ui/GlassCard";
import DataPill from "@/components/ui/DataPill";
import PanelTitle from "@/components/ui/PanelTitle";
import MenuSection from "@/components/ui/MenuSection";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import { STATUS_COLORS } from "@/lib/constants";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "in_progress" | "complete">("all");

  useEffect(() => {
    fetch("/api/project")
      .then((r) => r.json())
      .then((data) => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? projects : projects.filter((p) => p.status === filter);

  const draftCount = projects.filter((p) => p.status === "draft").length;
  const inProgressCount = projects.filter((p) => p.status === "in_progress").length;
  const completeCount = projects.filter((p) => p.status === "complete").length;

  return (
    <PageShell>

      {/* Page hero header */}
      <div style={{ padding: "32px 40px 40px", maxWidth: 640 }}>
        <div style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#a0978a",
          marginBottom: 12,
        }}>
          v1.0 · Workspace
        </div>
        <h1 style={{
          fontSize: 64,
          fontWeight: 500,
          letterSpacing: "-0.04em",
          lineHeight: 1.0,
          color: "#191816",
          marginBottom: 16,
        }}>
          Book<br />Builder
        </h1>
        <p style={{ fontSize: 16, color: "#7a7369", lineHeight: 1.6, fontWeight: 400, maxWidth: 440 }}>
          Turn spoken sermons and teachings into polished, publishable books — upload audio, extract insights, generate chapters.
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr 360px",
        gap: 32,
        padding: "0 40px 40px",
      }}>
        {/* Left panel */}
        <GlassCard className="nodum-float-1" style={{ padding: 24, alignSelf: "start" }}>
          <PanelTitle>Projects</PanelTitle>
          <div style={{ marginTop: 16 }}>
            <MenuSection
              items={[
                { label: `All (${projects.length})`, active: filter === "all", onClick: () => setFilter("all") },
                { label: `Draft (${draftCount})`, statusDot: "#a0978a", active: filter === "draft", onClick: () => setFilter("draft") },
                { label: `In Progress (${inProgressCount})`, statusDot: "#d4b895", active: filter === "in_progress", onClick: () => setFilter("in_progress") },
                { label: `Complete (${completeCount})`, statusDot: "#191816", active: filter === "complete", onClick: () => setFilter("complete") },
              ]}
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <Link href="/project/new" className="nodum-btn" style={{ width: "100%", justifyContent: "center" }}>
              New Project
            </Link>
          </div>
        </GlassCard>

        {/* Center */}
        <div>
          {loading ? (
            <Spinner />
          ) : filtered.length === 0 ? (
            <GlassCard style={{ padding: 48 }}>
              <div style={{
                border: "1.5px dashed rgba(0,0,0,0.12)",
                borderRadius: "var(--radius-md)",
                padding: 48,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
              }}>
                <p style={{ fontSize: 16, color: "#7a7369" }}>
                  {filter === "all" ? "No projects yet" : `No ${filter.replace("_", " ")} projects`}
                </p>
                <Link href="/project/new" className="nodum-btn">
                  Create Your First Project
                </Link>
              </div>
            </GlassCard>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 16,
            }}>
              {filtered.map((project) => (
                <Link
                  key={project.id}
                  href={`/project/${project.id}`}
                  className="float-card"
                  style={{ padding: 20, display: "block", textDecoration: "none", color: "inherit", transition: "transform 0.15s, box-shadow 0.15s" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 32px rgba(0,0,0,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.06)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600, color: "#191816", lineHeight: 1.3 }}>{project.title}</h2>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLORS[project.status] || "#a0978a" }} />
                      <span style={{ fontSize: 11, color: "#7a7369", fontWeight: 500 }}>
                        {project.status.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                  {project.description && (
                    <p style={{ fontSize: 13, color: "#7a7369", marginBottom: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {project.description}
                    </p>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "#7a7369",
                      background: "rgba(0,0,0,0.05)",
                      borderRadius: "var(--radius-pill)",
                      padding: "3px 10px",
                    }}>
                      {project.audience}
                    </span>
                    <span style={{ fontSize: 11, color: "#a0978a" }}>
                      {new Date(project.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right panel */}
        <GlassCard className="nodum-float-2" style={{ padding: 24, alignSelf: "start" }}>
          <PanelTitle>Workspace</PanelTitle>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <DataPill
              label="Total Projects"
              metric={String(projects.length)}
              accentColor="#191816"
            />
            <DataPill
              label="In Progress"
              metric={String(inProgressCount)}
              accentColor="#d4b895"
            />
            <DataPill
              label="Completed"
              metric={String(completeCount)}
              accentColor="#7a7369"
            />
            <DataPill
              label="Drafts"
              metric={String(draftCount)}
              accentColor="#a0978a"
            />
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}
