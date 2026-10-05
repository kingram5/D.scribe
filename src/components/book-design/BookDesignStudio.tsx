"use client";

import { useEffect, useRef, useState } from "react";
import {
  PAGE_STYLES,
  CHAPTER_OPENINGS,
  isPageStyle,
  isChapterOpening,
  type BookDesign,
  type PageStyle,
  type ChapterOpening,
} from "@/lib/book-design";
import styles from "./BookDesignStudio.module.css";

const STEPS = ["Page style", "Chapter opening", "Back-cover hook"];
const SAMPLE =
  "Every story begins with a moment worth remembering. Sometimes it arrives quietly: a conversation, a question, a small decision that changes how we see the world. These pages make room for those moments—and for the meaning we find in them.";

export default function BookDesignStudio({
  projectId,
  running = false,
  ready = false,
  progressLabel,
  progress,
  onContinue,
}: {
  projectId: string;
  running?: boolean;
  ready?: boolean;
  progressLabel?: string;
  progress?: number;
  onContinue?: () => void;
}) {
  const [design, setDesign] = useState<BookDesign>({});
  const [page, setPage] = useState<PageStyle>("classic");
  const [opening, setOpening] = useState<ChapterOpening>("minimal");
  const [hook, setHook] = useState("");
  const [hooks, setHooks] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [chapterTitle, setChapterTitle] = useState("A place to begin");
  const [sample, setSample] = useState(SAMPLE);
  const [isSample, setIsSample] = useState(true);
  const lock = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetch(`/api/project/${projectId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Couldn't load your saved choices.");
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setDesign(data);
        setPage(isPageStyle(data.page_style) ? data.page_style : "classic");
        setOpening(
          isChapterOpening(data.chapter_opening)
            ? data.chapter_opening
            : "minimal",
        );
        setHook(data.back_cover_hook || "");
        setHooks(
          Array.isArray(data.book_hook_options) ? data.book_hook_options : [],
        );
        const first = data.chapters?.find(
          (c: { chapter_number: number }) => c.chapter_number > 0,
        );
        if (first?.title) setChapterTitle(first.title);
        if (first?.summary) {
          setSample(first.summary);
          setIsSample(false);
        }
        setError("");
        setLoaded(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, reload]);

  async function save() {
    if (lock.current || !loaded) return;
    const patch: BookDesign =
      step === 0
        ? { page_style: page }
        : step === 1
          ? { chapter_opening: opening }
          : { back_cover_hook: hook };
    if (step === 2 && !hook) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/project/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok)
        throw new Error("Couldn't save that choice. Please retry.");
      setDesign((previous) => ({ ...previous, ...patch }));
      setNotice("Choice saved to your book.");
      if (step < 2) setStep(step + 1);
      else setCollapsed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Please retry.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function loadHooks(direction?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/book-hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, direction }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || data.error || "Couldn't load hooks.");
      setHooks(data.hooks);
      setHook(current => data.hooks.includes(current) || current === design.back_cover_hook ? current : "");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't load hooks. Please retry.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const theme = PAGE_STYLES[page];
  return (
    <section className={styles.studio} aria-label="Make it yours">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>MAKE IT YOURS</span>
          <h2>Your words. Your book.</h2>
          <p>{running ? "A few finishing touches while Theo writes." : "Finishing touches for your book."}</p>
        </div>
        <div className={styles.status}>
          <span role="status">
            {running
              ? progressLabel || "Writing your chapters…"
              : ready
                ? "Your chapters are ready"
                : "Your book preferences"}
          </span>
          {running && typeof progress === "number" && (
            <progress
              aria-label="Chapter generation"
              max={1}
              value={Math.max(0, Math.min(1, progress))}
            />
          )}
          {running && <small>Keep this page open while writing.</small>}
          {!running && ready && onContinue && (
            <button disabled={busy} onClick={onContinue}>
              Continue to Editor →
            </button>
          )}
        </div>
      </header>
      {collapsed ? (
        <div className={styles.summary}>
          <p>
            {design.page_style
              ? PAGE_STYLES[design.page_style].label
              : "Default page style"}{" "}
            ·{" "}
            {design.chapter_opening
              ? CHAPTER_OPENINGS[design.chapter_opening].label
              : "Default chapter opening"}
          </p>
          {design.back_cover_hook && (
            <blockquote>{design.back_cover_hook}</blockquote>
          )}
          <button
            onClick={() => {
              setCollapsed(false);
              setStep(0);
            }}
          >
            Revisit choices
          </button>
        </div>
      ) : (
        <>
          <nav className={styles.steps} aria-label="Book design activities">
            {STEPS.map((label, index) => (
              <button
                key={label}
                disabled={busy || !loaded || index > step}
                aria-current={index === step ? "step" : undefined}
                onClick={() => {
                  setStep(index);
                  setNotice("");
                }}
              >
                <span>{index + 1}</span>
                {label}
              </button>
            ))}
          </nav>
          {!loaded ? (
            <div className={styles.summary}>
              {error ? (
                <button onClick={() => setReload((n) => n + 1)}>
                  Retry loading choices
                </button>
              ) : (
                <p>Loading your book preferences…</p>
              )}
            </div>
          ) : (
            <div className={styles.content}>
              {step < 2 ? (
                <>
                  <div className={styles.previewWrap}>
                    <div
                      className={`${styles.paper} ${styles[page]}`}
                      style={{
                        fontFamily: theme.css,
                        lineHeight: theme.lineHeight,
                      }}
                    >
                      <div className={styles.runningHead}>
                        YOUR BOOK · CHAPTER ONE
                      </div>
                      {opening === "numeral" && (
                        <div className={styles.numeral}>01</div>
                      )}
                      <h3>{chapterTitle}</h3>
                      {opening === "divider" && (
                        <div className={styles.divider}>— ◆ —</div>
                      )}
                      <p
                        className={
                          opening === "dropcap" ? styles.dropcap : undefined
                        }
                      >
                        {sample}
                      </p>
                      <div className={styles.pageNumber}>1</div>
                    </div>
                    <small>
                      {isSample ? "Sample text" : "Outline excerpt"} · style
                      preview, not a finished chapter
                    </small>
                  </div>
                  <div className={styles.choices}>
                    <h3>
                      {step === 0
                        ? "Find your page style"
                        : "Choose your chapter opening"}
                    </h3>
                    <p>
                      {step === 0
                        ? "Tap a direction and watch the page change."
                        : "Your chosen page style stays with you."}
                    </p>
                    <div className={styles.optionGrid}>
                      {step === 0
                        ? Object.entries(PAGE_STYLES).map(([key, value]) => (
                            <button
                              key={key}
                              disabled={busy}
                              aria-pressed={page === key}
                              onClick={() => {
                                setPage(key as PageStyle);
                                setNotice("");
                              }}
                            >
                              <strong style={{ fontFamily: value.css }}>
                                {value.label}
                              </strong>
                              <small>{value.description}</small>
                            </button>
                          ))
                        : Object.entries(CHAPTER_OPENINGS).map(
                            ([key, value]) => (
                              <button
                                key={key}
                                disabled={busy}
                                aria-pressed={opening === key}
                                onClick={() => {
                                  setOpening(key as ChapterOpening);
                                  setNotice("");
                                }}
                              >
                                <strong>{value.label}</strong>
                                <small>{value.description}</small>
                              </button>
                            ),
                          )}
                    </div>
                    <small>
                      Saved styles apply to PDF and Word exports. Word uses your
                      installed fonts; Google Docs conversion may adjust
                      typography.
                    </small>
                  </div>
                </>
              ) : (
                <div className={styles.hooks}>
                  <h3>Pick your back-cover hook</h3>
                  <p>
                    Choose the invitation that feels like your book. Draft copy
                    based on your outline—revisit it after the manuscript is
                    complete.
                  </p>
                  {!hooks.length && (
                    <button disabled={busy} onClick={() => loadHooks()}>
                      {busy ? "Preparing your hooks…" : "Suggest three hooks"}
                    </button>
                  )}
                  {!!hooks.length && (
                    <div className={styles.hookGrid}>
                      {hooks.map((text, index) => (
                        <button
                          key={text}
                          disabled={busy}
                          aria-pressed={hook === text}
                          onClick={() => {
                            setHook(text);
                            setNotice("");
                          }}
                        >
                          <small>OPTION {index + 1}</small>
                          <p>{text}</p>
                          <strong>
                            {hook === text ? "Selected ✓" : "Pick this"}
                          </strong>
                        </button>
                      ))}
                    </div>
                  )}
                  {hook && !hooks.includes(hook) && (
                    <blockquote>Current choice: {hook}</blockquote>
                  )}
                  {!!hooks.length && (
                    <button
                      disabled={busy || !hook}
                      onClick={() => loadHooks(hook)}
                    >
                      {busy
                        ? "Preparing variations…"
                        : "More like my selection"}
                    </button>
                  )}
                  <small>
                    New AI suggestions use Ink based on token usage. Choosing
                    and saving styles is free. Your selected hook is saved
                    separately from the manuscript.
                  </small>
                </div>
              )}
            </div>
          )}
          <footer className={styles.footer}>
            <button
              disabled={busy}
              onClick={() => {
                setNotice("");
                if (step < 2) setStep(step + 1);
                else setCollapsed(true);
              }}
            >
              Skip {step === 2 ? "for now" : "this step"}
            </button>
            <button
              disabled={busy || !loaded || (step === 2 && !hook)}
              className={styles.primary}
              onClick={save}
            >
              {busy
                ? "Working…"
                : step === 2
                  ? "Save my hook"
                  : "Save & continue →"}
            </button>
          </footer>
        </>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
