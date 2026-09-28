"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import GlassCard from "@/components/ui/GlassCard";
import PanelTitle from "@/components/ui/PanelTitle";
import Spinner from "@/components/ui/Spinner";
import InkUpgradeModal from "@/components/ui/InkUpgradeModal";
import InterviewPanel from "@/components/publisher-ready/InterviewPanel";
import VoicePicker from "@/components/publisher-ready/VoicePicker";
import { useInkGuard } from "@/hooks/useInkGuard";
import { setGenerationBusy } from "@/lib/generation-guard";
import { bandFor } from "@/lib/publisher-ready/rubric";

type Step = "draft" | "edit" | "revise" | "final";

interface ChapterRow { id: string; chapter_number: number; title: string; target_word_count: number | null }
interface PassRow { chapter_id: string; step: Step; scores: Record<string, number | string> | null }
interface RunRow { id: string; status: string; ink_estimate: number | null }

const STAGES: { key: Step | "interview"; label: string; blurb: string }[] = [
  { key: "draft", label: "Draft", blurb: "Every chapter written from a beat plan pinned to your own words." },
  { key: "edit", label: "Editor read", blurb: "A senior editor reads each chapter the way an agent would and finds the holes." },
  { key: "interview", label: "Your interview", blurb: "Questions only you can answer, five per chapter at a time." },
  { key: "revise", label: "Revise", blurb: "Your answers go into the book in your words; the craft notes get fixed." },
  { key: "final", label: "Final check", blurb: "A last pass for rhythm, repetition and anything that reads as machine-written." },
];

/** Chapters to run a step on, a few at a time (each is its own request). */
const CONCURRENCY: Record<Step, number> = { draft: 2, edit: 2, revise: 2, final: 3 };

export default function PublisherReadyPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { showUpgrade, setShowUpgrade, guardedFetch } = useInkGuard();
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [run, setRun] = useState<RunRow | null>(null);
  const [passes, setPasses] = useState<PassRow[]>([]);
  const [estimate, setEstimate] = useState(0);
  const [estimateSkipDraft, setEstimateSkipDraft] = useState(0);
  const [running, setRunning] = useState<Step | null>(null);
  const [stepProgress, setStepProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [useCurrentDrafts, setUseCurrentDrafts] = useState(false);
  const [interviewing, setInterviewing] = useState(false);
  // Keep the voice picker up until the author finishes it, even if the editor finishes first.
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => { if (running === "edit") setPickerOpen(true); }, [running]);
  const cancelRef = useRef(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/publisher-ready/run?project_id=${projectId}`);
    if (res.status === 404) { setUnavailable(true); setLoading(false); return; }
    const data = await res.json();
    setChapters(data.chapters || []);
    setRun(data.run);
    setPasses(data.passes || []);
    setEstimate(data.estimate || 0);
    setEstimateSkipDraft(data.estimateSkipDraft || data.estimate || 0);
    setLoading(false);
    return data;
  }, [projectId]);

  useEffect(() => {
    void refresh().then((data) => {
      // Default to keeping existing drafts when every chapter already has one.
      const chs: { status?: string }[] = data?.chapters || [];
      if (chs.length && chs.every((c) => c.status === "generated" || c.status === "edited")) setUseCurrentDrafts(true);
    });
  }, [refresh]);

  useEffect(() => {
    setGenerationBusy(running ? "Publisher-Ready is still working" : null);
    return () => setGenerationBusy(null);
  }, [running]);

  const doneFor = (step: Step) => new Set(passes.filter((p) => p.step === step).map((p) => p.chapter_id));

  /** Run one step across every chapter that hasn't had it yet. */
  const runStep = async (runId: string, step: Step): Promise<boolean> => {
    const done = doneFor(step);
    const todo = chapters.filter((c) => !done.has(c.id));
    setRunning(step);
    setStepProgress({ done: 0, total: todo.length });
    let failed = false;
    let completed = 0;
    const queue = [...todo];

    const worker = async () => {
      while (queue.length && !cancelRef.current && !failed) {
        const ch = queue.shift()!;
        const res = await guardedFetch("/api/publisher-ready/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ run_id: runId, chapter_id: ch.id, step }),
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          if (body.error !== "out_of_ink") setError(body.message || body.error || `Chapter ${ch.chapter_number} failed`);
          failed = true;
          return;
        }
        // Read the SSE stream to its end; the final event carries result or error.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let outcome: { done?: boolean; error?: string; message?: string; status?: number } = {};
        while (true) {
          const { done: end, value } = await reader.read();
          if (end) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.done || evt.error) outcome = evt;
            } catch { /* partial line */ }
          }
        }
        if (outcome.error) {
          if (outcome.status === 402) setShowUpgrade(true);
          else setError(`Chapter ${ch.chapter_number}: ${outcome.message || outcome.error}`);
          failed = true;
          return;
        }
        completed++;
        setStepProgress({ done: completed, total: todo.length });
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY[step], todo.length || 1) }, worker));
    await refresh();
    setRunning(null);
    return !failed && !cancelRef.current;
  };

  const start = async () => {
    setError(null);
    cancelRef.current = false;
    let current = run && !["done", "cancelled"].includes(run.status) ? run : null;
    if (!current) {
      const res = await guardedFetch("/api/publisher-ready/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, skip_draft: useCurrentDrafts }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { if (data.error !== "out_of_ink") setError(data.message || data.error); return; }
      current = data.run as RunRow;
      setRun(current);
    }
    if (!useCurrentDrafts && !(await runStep(current.id, "draft"))) return;
    if (!(await runStep(current.id, "edit"))) return;
    setInterviewing(true);
  };

  const afterInterview = async () => {
    setInterviewing(false);
    if (!run) return;
    // Make sure the server has moved the run past the interview.
    await guardedFetch("/api/publisher-ready/interview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: run.id, action: "finish" }),
    });
    if (!(await runStep(run.id, "revise"))) return;
    if (!(await runStep(run.id, "final"))) return;
    await guardedFetch("/api/publisher-ready/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: run.id, action: "complete" }),
    });
    await refresh();
  };

  // Which of the nine steps this page is on: Interview until the answers are in, then Revise.
  const stepKey = process.env.NEXT_PUBLIC_PUBLISHER_READY !== "true" ? "generate"
    : run && ["revising", "checking", "done"].includes(run.status) ? "revise" : "interview";

  if (loading) {
    return <PageShell projectId={projectId} currentStep={stepKey}><div style={{ padding: 60, display: "flex", justifyContent: "center" }}><Spinner /></div></PageShell>;
  }
  if (unavailable) {
    return (
      <PageShell projectId={projectId} currentStep={stepKey}>
        <div style={{ padding: 40 }}><GlassCard style={{ padding: 32 }}>Publisher-Ready isn&apos;t available yet.</GlassCard></div>
      </PageShell>
    );
  }

  const editPasses = passes.filter((p) => p.step === "edit");
  const finished = run?.status === "done";
  const stageDone = (key: string) =>
    key === "interview"
      ? ["revising", "checking", "done"].includes(run?.status ?? "")
      : doneFor(key as Step).size >= chapters.length && chapters.length > 0;

  return (
    <PageShell projectId={projectId} currentStep={stepKey} hideFooterNav>
      <div style={{ padding: "0 40px 40px", display: "grid", gap: 20, maxWidth: 980, width: "100%", margin: "0 auto" }}>
        <GlassCard style={{ padding: 32 }}>
          <PanelTitle>Publisher-Ready pass</PanelTitle>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
            Your book gets drafted, read by an editor, and sent back to you with questions only you can answer. Your answers go into the book in your own words. About {(useCurrentDrafts ? estimateSkipDraft : estimate).toLocaleString()} Ink for this book.
          </p>
          <ol data-tut="pr-stages" style={{ listStyle: "none", padding: 0, margin: "20px 0 0", display: "grid", gap: 10 }}>
            {STAGES.map((s, i) => {
              const done = stageDone(s.key);
              const active = running === s.key || (s.key === "interview" && interviewing);
              return (
                <li key={s.key} style={{ display: "flex", gap: 14, alignItems: "baseline", opacity: done || active || !run ? 1 : 0.65 }}>
                  <span style={{ fontWeight: 700, color: done ? "#5E8A5A" : "var(--ds-accent-500, #C17A47)", minWidth: 20 }}>{done ? "✓" : i + 1}</span>
                  <span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{s.label}</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: 13 }}> · {s.blurb}</span>
                    {active && s.key !== "interview" && (
                      <span style={{ color: "var(--text-secondary)", fontSize: 13 }}> · {stepProgress.done} of {stepProgress.total} chapters</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>

          {!running && !interviewing && !finished && (
            <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
              {(!run || run.status === "drafting") && (
                <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={useCurrentDrafts} onChange={(e) => setUseCurrentDrafts(e.target.checked)} />
                  Use my current chapters as the first draft
                </label>
              )}
              <button
                onClick={run?.status === "interviewing" ? () => setInterviewing(true) : run && ["revising", "checking"].includes(run.status) ? afterInterview : start}
                style={{ fontSize: 14, fontWeight: 600, padding: "11px 20px", borderRadius: 10, border: "none", background: "var(--ds-accent-500, #C17A47)", color: "#fff", cursor: "pointer" }}
              >
                {!run || ["done", "cancelled"].includes(run.status) ? "Start the Publisher-Ready pass" : "Continue where I left off"}
              </button>
            </div>
          )}
          {running && (
            <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center", color: "var(--text-secondary)", fontSize: 13 }}>
              <Spinner /> Keep this tab open. {running === "edit" ? "The editor takes a few minutes per chapter." : ""}
              <button onClick={() => { cancelRef.current = true; }} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, border: "1px solid var(--ds-card-border)", background: "transparent", cursor: "pointer", color: "var(--text-primary)" }}>
                Pause after this chapter
              </button>
            </div>
          )}
          {error && <div role="alert" style={{ marginTop: 16, color: "#B4532A", fontSize: 13 }}>{error}</div>}
        </GlassCard>

        {/* While the editor reads (a few minutes of waiting): the one-time voice picker. */}
        {pickerOpen && (
          <GlassCard style={{ padding: 32 }}>
            <div data-tut="pr-picker"><VoicePicker projectId={projectId} onClose={() => setPickerOpen(false)} /></div>
          </GlassCard>
        )}

        {interviewing && run && (
          <GlassCard style={{ padding: 32 }}>
            <div data-tut="pr-interview"><PanelTitle>Your editor has questions</PanelTitle></div>
            <div style={{ marginTop: 16 }}>
              <InterviewPanel runId={run.id} guardedFetch={guardedFetch} onFinished={afterInterview} />
            </div>
          </GlassCard>
        )}

        {editPasses.length > 0 && (
          <GlassCard style={{ padding: 32 }}>
            <div data-tut="pr-editor-notes"><PanelTitle>What the editor saw</PanelTitle></div>
            <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
              {chapters.map((ch) => {
                const pass = editPasses.find((p) => p.chapter_id === ch.id);
                if (!pass?.scores) return null;
                const scores = Object.fromEntries(Object.entries(pass.scores).filter(([, v]) => typeof v === "number")) as Record<string, number>;
                return (
                  <div key={ch.id} style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      Ch {ch.chapter_number}: {ch.title} <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>· first draft: {bandFor(scores)}</span>
                    </div>
                    {typeof pass.scores.summary === "string" && (
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{pass.scores.summary}</div>
                    )}
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 16 }}>
              This is D.Scribe&apos;s own measure of how ready a chapter reads. It is not a prediction of any agent&apos;s or publisher&apos;s decision.
            </p>
          </GlassCard>
        )}

        {finished && (
          <GlassCard style={{ padding: 32 }}>
            <PanelTitle>Done</PanelTitle>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 8 }}>Every chapter has been revised with your answers and checked. Open the editor to read it.</p>
            <button onClick={() => router.push(`/project/${projectId}/editor`)} style={{ marginTop: 12, fontSize: 14, fontWeight: 600, padding: "11px 20px", borderRadius: 10, border: "none", background: "var(--ds-accent-500, #C17A47)", color: "#fff", cursor: "pointer" }}>
              Open the editor
            </button>
          </GlassCard>
        )}
      </div>
      {showUpgrade && <InkUpgradeModal onClose={() => setShowUpgrade(false)} />}
    </PageShell>
  );
}
