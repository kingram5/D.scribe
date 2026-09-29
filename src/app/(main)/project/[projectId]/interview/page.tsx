"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import GlassCard from "@/components/ui/GlassCard";
import Spinner from "@/components/ui/Spinner";
import BrainstormChat from "@/components/upload/BrainstormChat";

interface RunRow { id: string; status: string }
interface InterviewProgress { remaining: number; answered: number; skipped: number }

/**
 * Step 7, Interview (flow v2, Kyle 9/28): a second interview room exactly like
 * the first. T.H.E.O. welcomes the author back and asks the editor's questions
 * out loud; "I'm done" sends them to the Final Draft, where the revision runs.
 */
export default function InterviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<RunRow | null>(null);
  const [progress, setProgress] = useState<InterviewProgress | null>(null);
  const [inRoom, setInRoom] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [editorDone, setEditorDone] = useState(false);

  useEffect(() => {
    fetch(`/api/publisher-ready/run?project_id=${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setRun(d?.run ?? null);
        setProgress(d?.interview ?? null);
        // The interview only opens once the editor has read every chapter.
        const read = new Set(((d?.passes ?? []) as { chapter_id: string; step: string }[]).filter((x) => x.step === "edit").map((x) => x.chapter_id));
        const chs = (d?.chapters ?? []) as { id: string }[];
        setEditorDone(chs.length > 0 && chs.every((c) => read.has(c.id)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  const finish = useCallback(async () => {
    if (!run || finishing) return;
    setFinishing(true);
    await fetch("/api/publisher-ready/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: run.id, action: "finish" }),
    }).catch(() => null);
    router.push(`/project/${projectId}/editor`);
  }, [run, finishing, projectId, router]);

  const status = run?.status ?? "";
  const pastInterview = ["revising", "checking", "done"].includes(status);
  const ready = editorDone && ["interviewing", "editing", "drafting"].includes(status);
  const noQuestions = !!progress && progress.remaining === 0 && progress.answered === 0 && progress.skipped === 0;

  return (
    <PageShell projectId={projectId} currentStep="interview" hideFooterNav>
      <div style={{ padding: "0 clamp(16px, 4vw, 40px) 40px", display: "grid", placeItems: "center", minHeight: "60vh" }}>
        {loading ? (
          <Spinner />
        ) : !run || (!editorDone && !pastInterview) ? (
          <GlassCard style={{ padding: 32, maxWidth: 560 }}>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 15, lineHeight: 1.6 }}>
              The interview comes after the editor reads your whole draft.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
              <button onClick={() => router.push(`/project/${projectId}/publisher-ready`)} style={primary}>Go to Editor review</button>
              <button onClick={() => router.push(`/project/${projectId}/editor`)} style={secondary}>Skip to your final draft</button>
            </div>
          </GlassCard>
        ) : pastInterview ? (
          <GlassCard style={{ padding: 32, maxWidth: 560 }}>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 15, lineHeight: 1.6 }}>
              Your interview is done and your answers are going into the book.
            </p>
            <button onClick={() => router.push(`/project/${projectId}/editor`)} style={primary}>Open your final draft</button>
          </GlassCard>
        ) : (
          <GlassCard style={{ padding: "36px 32px", maxWidth: 600, textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontSize: 28, color: "var(--text-primary)" }}>
              Welcome back
            </div>
            <p style={{ margin: "12px auto 0", maxWidth: 460, color: "var(--text-secondary)", fontSize: 15, lineHeight: 1.6 }}>
              Your editor read the book and has questions only you can answer. T.H.E.O. will ask them out loud, same as your first interview.
              Skip anything that doesn&apos;t fit, or tap I&apos;m done whenever you&apos;ve said enough.
            </p>
            {progress && progress.remaining > 0 && (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--text-tertiary)" }}>
                {progress.remaining} question{progress.remaining === 1 ? "" : "s"} waiting{progress.answered ? ` · ${progress.answered} answered` : ""}
              </p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 22 }}>
              <button onClick={() => setInRoom(true)} disabled={!ready || finishing} style={primary}>
                {progress?.answered ? "Back into the interview" : "Start the interview"}
              </button>
              <button onClick={finish} disabled={finishing} style={secondary}>
                {finishing ? "Moving on…" : noQuestions ? "No questions, go to final draft" : "Skip the interview"}
              </button>
            </div>
          </GlassCard>
        )}
      </div>

      {inRoom && run && (
        <BrainstormChat
          projectId={projectId}
          autoStart
          onComplete={finish}
          onBack={() => setInRoom(false)}
          review={{
            runId: run.id,
            onDone: finish,
            onState: (s) => setProgress((p) => ({ remaining: s.remaining ?? p?.remaining ?? 0, answered: s.answered ?? p?.answered ?? 0, skipped: p?.skipped ?? 0 })),
          }}
        />
      )}
    </PageShell>
  );
}

const primary: React.CSSProperties = {
  marginTop: 0, fontSize: 14, fontWeight: 600, padding: "12px 20px", borderRadius: 10, border: "none",
  background: "var(--ds-accent-500, #C17A47)", color: "#fff", cursor: "pointer",
};
const secondary: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, padding: "12px 20px", borderRadius: 10, border: "1px solid var(--ds-card-border)",
  background: "transparent", color: "var(--text-primary)", cursor: "pointer",
};
