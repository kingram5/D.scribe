"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Chapter, ChapterContent } from "@/types";
import GlassCard from "@/components/ui/GlassCard";
import MenuSection from "@/components/ui/MenuSection";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import { STATUS_COLORS } from "@/lib/constants";

export default function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [chapters, setChapters] = useState<
    (Chapter & { latest_content?: ChapterContent })[]
  >([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [saved, setSaved] = useState(false);

  const fetchChapters = useCallback(async () => {
    try {
      const res = await fetch(`/api/project/${projectId}`);
      const project = await res.json();
      const chs: Chapter[] = project.chapters || [];

      // Fetch latest content for each chapter in parallel
      const withContent = await Promise.all(
        chs.map(async (ch) => {
          const contentRes = await fetch(`/api/chapter-content/${ch.id}`);
          const contentData = await contentRes.json();
          // API returns the ChapterContent object directly (with content, word_count, version fields)
          const hasContent = contentData.content && contentData.word_count > 0;
          return {
            ...ch,
            latest_content: hasContent
              ? (contentData as ChapterContent)
              : undefined,
          };
        })
      );

      setChapters(withContent);
      if (withContent.length > 0 && withContent[0].latest_content) {
        setContent(withContent[0].latest_content.content);
        setWordCount(withContent[0].latest_content.word_count);
      }
    } catch {
      // leave loading state, show empty chapters list
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  function handleContentChange(newContent: string) {
    setContent(newContent);
    setWordCount(newContent.split(/\s+/).filter(Boolean).length);
    setSaved(false);
  }

  function switchChapter(idx: number) {
    setActiveIdx(idx);
    const ch = chapters[idx];
    if (ch?.latest_content) {
      setContent(ch.latest_content.content);
      setWordCount(ch.latest_content.word_count);
    } else {
      setContent("");
      setWordCount(0);
    }
    setSaved(false);
  }

  async function saveContent() {
    const ch = chapters[activeIdx];
    if (!ch || !content.trim()) return;
    setSaving(true);

    const res = await fetch(`/api/chapter-content/${ch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (res.ok) {
      const savedData = await res.json();
      setChapters((prev) =>
        prev.map((c, i) =>
          i === activeIdx ? { ...c, latest_content: savedData, status: "edited" as const } : c
        )
      );
      setSaved(true);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <PageShell projectId={projectId} currentStep="editor">
        <Spinner />
      </PageShell>
    );
  }

  if (chapters.length === 0) {
    return (
      <PageShell projectId={projectId} currentStep="editor">
        <EmptyState
          message="No chapters to edit yet."
          actionLabel="Generate Chapters"
          onAction={() => router.push(`/project/${projectId}/generate`)}
        />
      </PageShell>
    );
  }

  const activeChapter = chapters[activeIdx];

  return (
    <PageShell projectId={projectId} currentStep="editor">
      <div style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        gap: 24,
        padding: "0 40px 40px",
      }}>
        {/* Left sidebar */}
        <GlassCard style={{ padding: 24, alignSelf: "start" }}>
          <MenuSection
            items={chapters.map((ch, i) => ({
              label: `Ch ${ch.chapter_number}: ${ch.title}`,
              statusDot: STATUS_COLORS[ch.status] || "#a0978a",
              active: i === activeIdx,
              onClick: () => switchChapter(i),
            }))}
          />
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(0,0,0,0.06)" }}>
            <Link
              href={`/project/${projectId}/export`}
              className="nodum-btn-ghost"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Export
            </Link>
          </div>
        </GlassCard>

        {/* Editor area */}
        <div className="glass-content" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
          {/* Header bar */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid rgba(255,255,255,0.5)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 500, color: "#191816", fontFamily: "var(--font-lora), serif" }}>
                Chapter {activeChapter?.chapter_number}: {activeChapter?.title}
              </span>
              {activeChapter?.latest_content && (
                <span style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                  color: "#a0978a",
                  background: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(255,255,255,0.8)",
                  borderRadius: "var(--radius-sm)",
                  padding: "2px 8px",
                }}>
                  v{activeChapter.latest_content.version}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, color: "#a0978a", fontWeight: 600 }}>
                {wordCount.toLocaleString()} words
              </span>
              {saved && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#191816" }} />
                  <span style={{ fontSize: 11, color: "#7a7369" }}>Saved</span>
                </div>
              )}
              <button
                onClick={saveContent}
                disabled={saving || !content.trim()}
                className="nodum-btn"
                style={{ padding: "6px 16px", fontSize: 12 }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {/* Textarea */}
          <textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Generated chapter content will appear here. Go to the Generate page to create content first."
            style={{
              background: "transparent",
              padding: "40px 48px",
              fontSize: 16,
              lineHeight: 1.9,
              fontFamily: "var(--font-lora), Georgia, serif",
              letterSpacing: "0.01em",
              border: "none",
              outline: "none",
              width: "100%",
              maxWidth: 680,
              margin: "0 auto",
              minHeight: 600,
              resize: "none",
              color: "#1A1816",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>
    </PageShell>
  );
}
