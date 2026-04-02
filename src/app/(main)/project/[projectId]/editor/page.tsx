"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Chapter, ChapterContent } from "@/types";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";

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
  const totalWords = chapters.reduce((sum, ch) => sum + (ch.latest_content?.word_count || 0), 0);
  const chaptersWithContent = chapters.filter(ch => ch.latest_content && ch.latest_content.word_count > 0).length;
  const readingTime = Math.max(1, Math.round(wordCount / 250));

  // Convert chapter number to roman numeral
  function toRoman(num: number): string {
    const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    const syms = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
    let result = "";
    for (let i = 0; i < vals.length; i++) {
      while (num >= vals[i]) {
        result += syms[i];
        num -= vals[i];
      }
    }
    return result;
  }

  return (
    <PageShell projectId={projectId} currentStep="editor">
      <style>{`
        @media (max-width: 768px) {
          .ds-editor-layout { flex-direction: column !important; overflow-y: auto !important; height: auto !important; min-height: calc(100vh - 56px) !important; }
          .ds-editor-layout > div:first-child { width: 100% !important; min-width: 100% !important; height: auto !important; max-height: 250px !important; overflow-y: auto !important; }
          .ds-editor-layout > div:last-child { min-height: 500px !important; }
          .ds-editor-float-toolbar { display: none !important; }
          .ds-editor-stats-bar { display: none !important; }
        }
      `}</style>
      <div className="ds-editor-layout" style={{
        display: "flex",
        height: "calc(100vh - 56px)",
        overflow: "hidden",
        background: "var(--env-bg)",
      }}>

        {/* ===== LEFT SIDEBAR ===== */}
        <div style={{
          width: 340,
          minWidth: 340,
          background: "var(--ds-card-bg)",
          borderRight: "1px solid var(--ds-card-border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>

          {/* Sidebar Header */}
          <div style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--ds-card-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "linear-gradient(135deg, #C17A47 0%, #A86230 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text-primary)",
                fontFamily: "var(--font-playfair), var(--font-lora), serif",
              }}>
                D
              </div>
              <div>
                <span style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  letterSpacing: "-0.01em",
                }}>D.scribe</span>
                <span style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  marginLeft: 6,
                  fontFamily: "var(--font-manrope), sans-serif",
                  fontWeight: 500,
                }}>Studio</span>
              </div>
            </div>
            <button
              onClick={saveContent}
              disabled={saving || !content.trim()}
              title="Save manuscript"
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: "1px solid var(--ds-card-border)",
                background: "var(--ds-input-bg)",
                color: "var(--text-secondary)",
                cursor: saving || !content.trim() ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: saving || !content.trim() ? 0.4 : 1,
                transition: "all 0.2s ease",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </div>

          {/* Project Card */}
          <div style={{
            margin: "16px 16px 0",
            padding: "14px 16px",
            borderRadius: 10,
            background: "var(--ds-input-bg)",
            border: "1px solid var(--ds-card-border)",
          }}>
            <div style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "#C17A47",
              marginBottom: 6,
              fontFamily: "var(--font-manrope), sans-serif",
            }}>
              Current Project
            </div>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
              fontFamily: "var(--font-playfair), var(--font-lora), serif",
              lineHeight: 1.3,
              marginBottom: 8,
            }}>
              {activeChapter?.title ? `Chapter ${activeChapter.chapter_number}` : "Untitled"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {saved ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#059669" }} />
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-manrope), sans-serif" }}>Saved</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C17A47" }} />
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-manrope), sans-serif" }}>
                    {saving ? "Saving..." : "Unsaved changes"}
                  </span>
                </div>
              )}
              <span style={{
                fontSize: 10,
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-geist-mono), monospace",
                background: "var(--ds-input-bg)",
                padding: "2px 6px",
                borderRadius: 4,
              }}>
                DRAFT
              </span>
            </div>
          </div>

          {/* Chapter List */}
          <div style={{
            padding: "20px 16px 8px",
          }}>
            <div style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "var(--text-tertiary)",
              marginBottom: 12,
              fontFamily: "var(--font-manrope), sans-serif",
            }}>
              Manuscript
            </div>
          </div>

          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 16px 16px",
          }}>
            {chapters.map((ch, i) => {
              const isActive = i === activeIdx;
              const chNum = String(ch.chapter_number).padStart(2, "0");
              const chWords = ch.latest_content?.word_count || 0;
              const isLast = i === chapters.length - 1;
              return (
                <div key={ch.id} style={{ position: "relative" }}>
                  {/* Vertical connecting line */}
                  {!isLast && (
                    <div style={{
                      position: "absolute",
                      left: 19,
                      top: 40,
                      bottom: -8,
                      width: 1,
                      background: "var(--ds-card-border)",
                    }} />
                  )}
                  <button
                    onClick={() => switchChapter(i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      padding: "10px 12px",
                      marginBottom: 4,
                      borderRadius: 8,
                      border: isActive ? "1px solid rgba(193,122,71,0.4)" : "1px solid transparent",
                      background: isActive ? "rgba(193,122,71,0.12)" : "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                      position: "relative",
                      zIndex: 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = "var(--ds-input-bg)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    {/* Chapter number square */}
                    <div style={{
                      width: 38,
                      height: 38,
                      minWidth: 38,
                      borderRadius: 8,
                      background: isActive ? "rgba(193,122,71,0.2)" : "var(--ds-input-bg)",
                      border: isActive ? "1px solid rgba(193,122,71,0.3)" : "1px solid var(--ds-card-border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      color: isActive ? "#C17A47" : "var(--text-secondary)",
                      fontFamily: "var(--font-geist-mono), monospace",
                      transition: "all 0.15s ease",
                    }}>
                      {chNum}
                    </div>
                    {/* Chapter info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                        fontFamily: "var(--font-manrope), sans-serif",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        transition: "color 0.15s ease",
                      }}>
                        {ch.title}
                      </div>
                      <div style={{
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        fontFamily: "var(--font-geist-mono), monospace",
                        marginTop: 2,
                      }}>
                        {chWords > 0 ? `${chWords.toLocaleString()} words` : "No content"}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Manuscript Stats */}
          <div style={{
            padding: "16px",
            borderTop: "1px solid var(--ds-card-border)",
          }}>
            <div style={{
              padding: "16px",
              borderRadius: 10,
              background: "var(--ds-input-bg)",
              border: "1px solid var(--ds-input-bg)",
            }}>
              <div style={{
                fontSize: 32,
                fontWeight: 700,
                color: "var(--text-primary)",
                fontFamily: "var(--font-manrope), sans-serif",
                lineHeight: 1,
              }}>
                {totalWords.toLocaleString()}
              </div>
              <div style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                fontFamily: "var(--font-manrope), sans-serif",
                marginTop: 4,
              }}>
                words across {chaptersWithContent}/{chapters.length} chapters
              </div>
              {/* Progress bar */}
              <div style={{
                marginTop: 10,
                height: 4,
                borderRadius: 2,
                background: "var(--ds-card-border)",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  borderRadius: 2,
                  background: chaptersWithContent === chapters.length ? "#059669" : "#C17A47",
                  width: `${chapters.length > 0 ? (chaptersWithContent / chapters.length) * 100 : 0}%`,
                  transition: "width 0.4s ease",
                }} />
              </div>
            </div>

            {/* Export link */}
            <Link
              href={`/project/${projectId}/export`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                marginTop: 12,
                padding: "8px 0",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-secondary)",
                textDecoration: "none",
                borderRadius: 6,
                border: "1px solid var(--ds-card-border)",
                background: "transparent",
                fontFamily: "var(--font-manrope), sans-serif",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--ds-input-bg)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Export Manuscript
            </Link>
          </div>
        </div>

        {/* ===== MAIN EDITOR AREA ===== */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
          background: "var(--env-bg)",
        }}>

          {/* Floating Stats Bar — top center */}
          <div className="ds-editor-stats-bar" style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "8px 20px",
            borderRadius: 40,
            background: "var(--ds-card-bg)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid var(--ds-card-border)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-primary)",
                fontFamily: "var(--font-geist-mono), monospace",
              }}>
                {wordCount.toLocaleString()}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-manrope), sans-serif" }}>
                words
              </span>
            </div>
            <div style={{ width: 1, height: 14, background: "var(--ds-card-border)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-primary)",
                fontFamily: "var(--font-geist-mono), monospace",
              }}>
                {readingTime}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-manrope), sans-serif" }}>
                min read
              </span>
            </div>
            {activeChapter?.latest_content && (
              <>
                <div style={{ width: 1, height: 14, background: "var(--ds-card-border)" }} />
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-geist-mono), monospace",
                  letterSpacing: "0.05em",
                }}>
                  v{activeChapter.latest_content.version}
                </span>
              </>
            )}
          </div>

          {/* Floating Toolbar — left edge, vertically centered */}
          <div className="ds-editor-float-toolbar" style={{
            position: "absolute",
            left: 20,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            padding: "8px 6px",
            borderRadius: 12,
            background: "var(--ds-card-bg)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid var(--ds-card-border)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
          }}>
            {/* Text style */}
            <button style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              fontWeight: 700,
              fontFamily: "var(--font-playfair), var(--font-lora), serif",
              transition: "all 0.15s ease",
            }}
              title="Text styles"
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--ds-card-border)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              A
            </button>
            {/* Bold */}
            <button style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 800,
              fontFamily: "var(--font-manrope), sans-serif",
              transition: "all 0.15s ease",
            }}
              title="Bold"
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--ds-card-border)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              B
            </button>
            {/* Italic */}
            <button style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontStyle: "italic",
              fontWeight: 600,
              fontFamily: "var(--font-playfair), var(--font-lora), serif",
              transition: "all 0.15s ease",
            }}
              title="Italic"
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--ds-card-border)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              I
            </button>
            {/* Divider */}
            <div style={{ width: 20, height: 1, background: "var(--ds-card-border)", margin: "4px 0" }} />
            {/* Quote */}
            <button style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              fontFamily: "var(--font-playfair), var(--font-lora), serif",
              lineHeight: 1,
              transition: "all 0.15s ease",
            }}
              title="Quote"
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--ds-card-border)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              &ldquo;
            </button>
            {/* Divider */}
            <div style={{ width: 20, height: 1, background: "var(--ds-card-border)", margin: "4px 0" }} />
            {/* AI Sparkle */}
            <button style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "none",
              background: "linear-gradient(135deg, #C17A47 0%, #A86230 100%)",
              color: "var(--text-primary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
              boxShadow: "0 2px 8px rgba(193,122,71,0.3)",
            }}
              title="AI Assist"
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(193,122,71,0.5)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(193,122,71,0.3)"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L13.09 8.26L18 6L14.74 10.91L21 12L14.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L9.26 13.09L3 12L9.26 10.91L6 6L10.91 8.26L12 2Z" />
              </svg>
            </button>
          </div>

          {/* Scrollable Paper Area */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "72px 80px 60px",
            display: "flex",
            justifyContent: "center",
          }}>
            <div style={{
              width: "100%",
              maxWidth: 840,
              minHeight: "100%",
              position: "relative",
            }}>
              {/* Paper surface */}
              <div style={{
                background: "rgba(252,251,248,0.04)",
                borderRadius: 4,
                boxShadow: "0 2px 40px rgba(0,0,0,0.15), 0 0 0 1px var(--ds-input-bg)",
                padding: "64px 80px 80px",
                position: "relative",
                minHeight: 800,
              }}>
                {/* Red margin line */}
                <div style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 64,
                  width: 1,
                  background: "rgba(193,122,71,0.12)",
                }} />
                {/* Second faint margin line */}
                <div style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 66,
                  width: 1,
                  background: "rgba(193,122,71,0.06)",
                }} />

                {/* Chapter Header */}
                <div style={{ marginBottom: 48, paddingLeft: 24 }}>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    color: "#C17A47",
                    fontFamily: "var(--font-manrope), sans-serif",
                    marginBottom: 12,
                  }}>
                    Chapter {toRoman(activeChapter?.chapter_number || 1)}
                  </div>
                  <h1 style={{
                    fontSize: 48,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-playfair), var(--font-lora), serif",
                    lineHeight: 1.15,
                    margin: 0,
                    letterSpacing: "-0.02em",
                  }}>
                    {activeChapter?.title || "Untitled Chapter"}
                  </h1>
                  {/* Divider */}
                  <div style={{
                    marginTop: 20,
                    width: 60,
                    height: 2,
                    background: "linear-gradient(90deg, #C17A47, transparent)",
                    borderRadius: 1,
                  }} />
                </div>

                {/* Textarea */}
                <textarea
                  className="ds-editor-textarea"
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder="Begin writing your chapter here, or generate content from the Generate page..."
                  style={{
                    background: "transparent",
                    padding: "0 24px",
                    fontSize: 19,
                    lineHeight: 2.1,
                    fontFamily: "var(--font-lora), Georgia, serif",
                    letterSpacing: "0.01em",
                    border: "none",
                    outline: "none",
                    width: "100%",
                    minHeight: 600,
                    resize: "none",
                    color: "var(--text-primary)",
                    boxSizing: "border-box",
                    textAlign: "justify",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Floating Save Button — bottom right */}
          <button
            onClick={saveContent}
            disabled={saving || !content.trim()}
            style={{
              position: "absolute",
              bottom: 24,
              right: 24,
              zIndex: 10,
              height: 48,
              borderRadius: 9999,
              border: "none",
              background: saved
                ? "#059669"
                : saving
                  ? "rgba(193,122,71,0.5)"
                  : "linear-gradient(135deg, #C17A47 0%, #A86230 100%)",
              color: "#F9F7F2",
              cursor: saving || !content.trim() ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "0 28px",
              boxShadow: "0 4px 20px rgba(193,122,71,0.35)",
              transition: "all 0.2s ease",
              opacity: !content.trim() ? 0.4 : 1,
              fontFamily: "var(--font-manrope), sans-serif",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
            onMouseEnter={(e) => {
              if (!saving && content.trim()) {
                e.currentTarget.style.boxShadow = "0 6px 28px rgba(193,122,71,0.5)";
                e.currentTarget.style.transform = "scale(1.03)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 4px 20px rgba(193,122,71,0.35)";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {saving ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Saving...
              </>
            ) : saved ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Saved
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Keyframe for save spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </PageShell>
  );
}
