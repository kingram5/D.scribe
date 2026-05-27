"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";

function ChevronUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export default function StructurePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [numChapters, setNumChapters] = useState(8);
  const [wordsPerChapter, setWordsPerChapter] = useState(2500);
  const [audience, setAudience] = useState("General");
  const [translation, setTranslation] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

  const SCRIPTURE_AUDIENCES = ["Christian Living", "Faith Community"];
  const TRANSLATIONS = ["KJV", "NIV", "ESV", "NLT", "NKJV", "NASB", "CSB", "The Message"];

  const AUDIENCES = [
    "General",
    "Christian Living",
    "Faith Community",
    "Leadership",
    "Business & Economics",
    "Self-Help",
    "Personal Development",
    "Health & Wellness",
    "Relationships & Family",
    "Parenting",
    "Memoir & Biography",
    "Lifestyle",
    "Psychology & Motivation",
    "Money & Finance",
    "Young Adult",
    "Academic",
  ];

  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => r.json())
      .then((p) => {
        if (p.num_chapters) setNumChapters(p.num_chapters);
        if (p.target_words_per_chapter) setWordsPerChapter(p.target_words_per_chapter);
        if (p.audience) setAudience(p.audience);
        if (p.scripture_translation) setTranslation(p.scripture_translation);
        if (p.num_chapters) setHasSaved(true);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  async function commenceMapping() {
    setSaving(true);
    await fetch(`/api/project/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        num_chapters: numChapters,
        target_words_per_chapter: wordsPerChapter,
        audience,
        scripture_translation: SCRIPTURE_AUDIENCES.includes(audience) ? (translation || null) : null,
      }),
    }).catch(() => {});

    // After saving project settings, update existing chapters' target_word_count
    const projectData = await fetch(`/api/project/${projectId}`).then(r => r.json());
    const existingChapters = projectData.chapters || [];
    if (existingChapters.length > 0) {
      await Promise.all(existingChapters.map((ch: { id: string }) =>
        fetch(`/api/project/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapter_id: ch.id, target_word_count: wordsPerChapter }),
        })
      ));
    }

    setHasSaved(true);
    setSaving(false);
    router.push(`/project/${projectId}/analysis`);
  }

  if (loading) {
    return (
      <PageShell projectId={projectId} currentStep="structure" disableNextStep={!hasSaved}>
        <Spinner />
      </PageShell>
    );
  }

  const totalWords = numChapters * wordsPerChapter;
  const bookSize =
    totalWords < 20000 ? "pamphlet" :
    totalWords < 50000 ? "short book" :
    totalWords < 80000 ? "standard book" : "long book";

  return (
    <PageShell projectId={projectId} currentStep="structure" disableNextStep={!hasSaved}>
      <style>{`
        @media (max-width: 768px) {
          .ds-structure-wrap { overflow-y: auto !important; padding: 16px !important; align-items: flex-start !important; }
          .ds-structure-card { padding: 24px 16px !important; border-radius: 20px !important; }
        }
      `}</style>
      <div className="ds-structure-wrap" style={{
        flex: 1,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        padding: "32px 24px 48px",
      }}>
        {/* Centered card */}
        <div className="ds-structure-card" style={{
          width: "100%",
          maxWidth: 640,
          padding: 48,
          borderRadius: 32,
          background: "var(--ds-card-bg)",
          border: "1px solid var(--ds-card-border)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        }}>
          {/* Header */}
          <h1 style={{
            fontFamily: "var(--font-playfair), serif",
            fontStyle: "italic",
            fontSize: 32,
            fontWeight: 400,
            color: "var(--text-primary)",
            margin: 0,
            marginBottom: 8,
          }}>
            Structure Setup
          </h1>
          <p style={{
            fontFamily: "var(--font-manrope), sans-serif",
            fontSize: 14,
            color: "var(--text-secondary)",
            margin: 0,
            marginBottom: 32,
          }}>
            Define the structural parameters for your manuscript.
          </p>

          {/* Accent divider */}
          <div style={{
            width: 40,
            height: 1,
            background: "#C17A47",
            opacity: 0.5,
            marginBottom: 40,
          }} />

          {/* Target Chapters row */}
          <div style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--ds-card-border)",
            paddingBottom: 24,
            marginBottom: 32,
          }}>
            <div>
              <div style={{
                fontSize: 10,
                fontFamily: "var(--font-manrope), sans-serif",
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: "0.15em",
                color: "#C17A47",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span>01</span>
                <span style={{ width: 16, height: 1, background: "#C17A47" }} />
                <span>Divisions</span>
              </div>
              <h2 style={{
                fontFamily: "var(--font-playfair), serif",
                fontSize: 24,
                fontWeight: 400,
                color: "var(--text-primary)",
                margin: 0,
              }}>Target Chapters</h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <span style={{
                fontFamily: "var(--font-manrope), sans-serif",
                fontWeight: 300,
                fontSize: 48,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.04em",
                width: 64,
                textAlign: "right",
                color: "var(--text-primary)",
              }}>{numChapters}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button
                  onClick={() => setNumChapters(Math.min(30, numChapters + 1))}
                  style={{
                    width: 40, height: 32,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "1px solid var(--ds-card-border)",
                    borderRadius: 4,
                    background: "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-input-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                ><ChevronUp /></button>
                <button
                  onClick={() => setNumChapters(Math.max(1, numChapters - 1))}
                  style={{
                    width: 40, height: 32,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "1px solid var(--ds-card-border)",
                    borderRadius: 4,
                    background: "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-input-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                ><ChevronDown /></button>
              </div>
            </div>
          </div>

          {/* Words per Chapter row */}
          <div style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--ds-card-border)",
            paddingBottom: 24,
            marginBottom: 32,
          }}>
            <div>
              <div style={{
                fontSize: 10,
                fontFamily: "var(--font-manrope), sans-serif",
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: "0.15em",
                color: "#C17A47",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span>02</span>
                <span style={{ width: 16, height: 1, background: "#C17A47" }} />
                <span>Volume</span>
              </div>
              <h2 style={{
                fontFamily: "var(--font-playfair), serif",
                fontSize: 24,
                fontWeight: 400,
                color: "var(--text-primary)",
                margin: 0,
              }}>Words per Chapter</h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <span style={{
                fontFamily: "var(--font-manrope), sans-serif",
                fontWeight: 300,
                fontSize: 48,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.04em",
                width: 100,
                textAlign: "right",
                color: "var(--text-primary)",
              }}>{wordsPerChapter.toLocaleString()}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button
                  onClick={() => setWordsPerChapter(Math.min(10000, wordsPerChapter + 250))}
                  style={{
                    width: 40, height: 32,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "1px solid var(--ds-card-border)",
                    borderRadius: 4,
                    background: "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-input-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                ><ChevronUp /></button>
                <button
                  onClick={() => setWordsPerChapter(Math.max(500, wordsPerChapter - 250))}
                  style={{
                    width: 40, height: 32,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "1px solid var(--ds-card-border)",
                    borderRadius: 4,
                    background: "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-input-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                ><ChevronDown /></button>
              </div>
            </div>
          </div>

          {/* Audience selector */}
          <div style={{
            borderBottom: "1px solid var(--ds-card-border)",
            paddingBottom: 24,
            marginBottom: 32,
          }}>
            <div style={{
              fontSize: 10,
              fontFamily: "var(--font-manrope), sans-serif",
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: "0.15em",
              color: "#C17A47",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <span>03</span>
              <span style={{ width: 16, height: 1, background: "#C17A47" }} />
              <span>Audience</span>
            </div>
            <h2 style={{
              fontFamily: "var(--font-playfair), serif",
              fontSize: 24,
              fontWeight: 400,
              color: "var(--text-primary)",
              margin: 0,
              marginBottom: 16,
            }}>Target Reader</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {AUDIENCES.map((a) => (
                <button
                  key={a}
                  onClick={() => setAudience(a)}
                  style={{
                    padding: "8px 16px",
                    fontSize: 13,
                    fontFamily: "var(--font-manrope), sans-serif",
                    fontWeight: audience === a ? 600 : 400,
                    background: audience === a ? "#C17A47" : "transparent",
                    color: audience === a ? "#fff" : "var(--text-secondary)",
                    border: audience === a ? "1px solid #C17A47" : "1px solid var(--ds-card-border)",
                    borderRadius: 8,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Scripture translation — only for faith audiences (#11) */}
          {SCRIPTURE_AUDIENCES.includes(audience) && (
            <div style={{
              borderBottom: "1px solid var(--ds-card-border)",
              paddingBottom: 24,
              marginBottom: 32,
            }}>
              <div style={{
                fontSize: 10,
                fontFamily: "var(--font-manrope), sans-serif",
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: "0.15em",
                color: "#C17A47",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span>04</span>
                <span style={{ width: 16, height: 1, background: "#C17A47" }} />
                <span>Scripture</span>
              </div>
              <h2 style={{
                fontFamily: "var(--font-playfair), serif",
                fontSize: 24,
                fontWeight: 400,
                color: "var(--text-primary)",
                margin: 0,
                marginBottom: 16,
              }}>Bible Translation</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {TRANSLATIONS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTranslation(t)}
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      fontFamily: "var(--font-manrope), sans-serif",
                      fontWeight: translation === t ? 600 : 400,
                      background: translation === t ? "#C17A47" : "transparent",
                      color: translation === t ? "#fff" : "var(--text-secondary)",
                      border: translation === t ? "1px solid #C17A47" : "1px solid var(--ds-card-border)",
                      borderRadius: 8,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Total estimate */}
          <div style={{
            textAlign: "center",
            fontSize: 13,
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-manrope), sans-serif",
            marginBottom: 40,
          }}>
            ~{totalWords.toLocaleString()} words total ({bookSize})
          </div>

          {/* Commence Mapping button */}
          <button
            onClick={commenceMapping}
            disabled={saving}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              background: "#C17A47",
              color: "var(--text-primary)",
              padding: 16,
              paddingLeft: 32,
              paddingRight: 16,
              borderRadius: 9999,
              border: "none",
              fontFamily: "var(--font-manrope), sans-serif",
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "0.02em",
              cursor: saving ? "wait" : "pointer",
              transition: "background 0.15s",
              opacity: saving ? 0.7 : 1,
            }}
            onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = "#D98B58"; }}
            onMouseLeave={(e) => { if (!saving) e.currentTarget.style.background = "#C17A47"; }}
          >
            <span style={{ flex: 1 }}>{saving ? "Saving..." : "Set Chapters / Words"}</span>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "var(--ds-input-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <ArrowRight />
            </div>
          </button>
        </div>
      </div>
    </PageShell>
  );
}
