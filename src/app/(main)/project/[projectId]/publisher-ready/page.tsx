"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import GlassCard from "@/components/ui/GlassCard";
import PanelTitle from "@/components/ui/PanelTitle";
import Spinner from "@/components/ui/Spinner";
import InkUpgradeModal from "@/components/ui/InkUpgradeModal";
import VoicePicker from "@/components/publisher-ready/VoicePicker";
import { useInkGuard } from "@/hooks/useInkGuard";
import { usePrStepRunner } from "@/hooks/usePrStepRunner";
import { setGenerationBusy } from "@/lib/generation-guard";
import { bandFor } from "@/lib/publisher-ready/rubric";

interface ChapterRow { id: string; chapter_number: number; title: string; target_word_count: number | null; status?: string }
interface PassRow { chapter_id: string; step: string; scores: Record<string, number | string> | null }
interface RunRow { id: string; status: string }

/**
 * Step 6, Editor review (flow v2, Kyle 9/28). One button starts the editor
 * reading every chapter; while it works the voice picker sits dead center and
 * keeps serving pairs until the editor finishes. Then Next goes to the
 * interview room. Runs while this tab is open (not a server-side job).
 */
export default function EditorReviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { showUpgrade, setShowUpgrade, guardedFetch } = useInkGuard();
  const openUpgrade = useCallback(() => setShowUpgrade(true), [setShowUpgrade]);
  const pr = usePrStepRunner(guardedFetch, openUpgrade);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [run, setRun] = useState<RunRow | null>(null);
  const [passes, setPasses] = useState<PassRow[]>([]);
  const [estimate, setEstimate] = useState(0);
  const [startError, setStartError] = useState<string | null>(null);

  const apply = useCallback((data: { chapters?: ChapterRow[]; run?: RunRow | null; passes?: PassRow[]; estimate?: number; estimateSkipDraft?: number } | null) => {
    if (!data) { setUnavailable(true); setLoading(false); return; }
    setChapters(data.chapters || []);
    setRun(data.run ?? null);
    setPasses(data.passes || []);
    setEstimate(data.estimateSkipDraft || data.estimate || 0);
    setLoading(false);
  }, []);

  const load = useCallback(
    () => fetch(`/api/publisher-ready/run?project_id=${projectId}`).then((r) => (r.status === 404 ? null : r.json())),
    [projectId],
  );
  const refresh = useCallback(async () => apply(await load()), [apply, load]);

  useEffect(() => { load().then(apply).catch(() => setLoading(false)); }, [load, apply]);

  const editing = pr.running === "edit";
  useEffect(() => {
    setGenerationBusy(editing ? "Your editor is still reading" : null);
    return () => setGenerationBusy(null);
  }, [editing]);

  const edited = new Set(passes.filter((p) => p.step === "edit").map((p) => p.chapter_id));
  const allRead = chapters.length > 0 && chapters.every((c) => edited.has(c.id));
  const liveRun = run && !["done", "cancelled"].includes(run.status) ? run : null;
  const pastEditor = !!liveRun && ["interviewing", "revising", "checking"].includes(liveRun.status);
  const undrafted = chapters.filter((c) => c.status !== "generated" && c.status !== "edited");

  const startEditor = async () => {
    setStartError(null);
    let current = liveRun;
    if (!current) {
      const res = await guardedFetch("/api/publisher-ready/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, skip_draft: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { if (data.error !== "out_of_ink") setStartError(data.message || data.error); return; }
      current = data.run as RunRow;
      setRun(current);
    }
    const todo = chapters.filter((c) => !edited.has(c.id));
    await pr.runStep(current.id, "edit", todo, (chapterId) => {
      setPasses((prev) => [...prev, { chapter_id: chapterId, step: "edit", scores: null }]);
    });
    await refresh();
  };

  if (loading) {
    return <PageShell projectId={projectId} currentStep="review"><div style={{ padding: 60, display: "flex", justifyContent: "center" }}><Spinner /></div></PageShell>;
  }
  if (unavailable) {
    return (
      <PageShell projectId={projectId} currentStep="review">
        <div style={{ padding: 40 }}><GlassCard style={{ padding: 32 }}>Publisher-ready review isn&apos;t available yet.</GlassCard></div>
      </PageShell>
    );
  }

  const button: React.CSSProperties = {
    fontSize: 15, fontWeight: 600, padding: "13px 22px", borderRadius: 10, border: "none",
    background: "var(--ds-accent-500, #C17A47)", color: "#fff", cursor: "pointer",
  };
  const editPasses = passes.filter((p) => p.step === "edit" && p.scores);
  const started = editing || edited.size > 0;

  return (
    <PageShell projectId={projectId} currentStep="review" hideFooterNav>
      <div style={{ padding: "0 clamp(16px, 4vw, 40px) 48px", display: "grid", gap: 20, maxWidth: 760, width: "100%", margin: "0 auto" }}>
        {/* The editor's status: a slim line once it's running, so the picker owns the middle. */}
        {started && (
          <div role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, fontSize: 14, color: "var(--text-secondary)" }}>
            {editing && <Spinner />}
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              {allRead || pastEditor ? "Your editor is done" : editing ? `Your editor is reading · ${pr.progress.done} of ${pr.progress.total} chapters` : `Your editor read ${edited.size} of ${chapters.length} chapters`}
            </span>
            {editing && <span>Keep this tab open.</span>}
            {!editing && !allRead && !pastEditor && (
              <button onClick={startEditor} style={{ ...button, padding: "7px 14px", fontSize: 13 }}>Finish the read</button>
            )}
            {(allRead || pastEditor) && (
              <button onClick={() => router.push(`/project/${projectId}/interview`)} style={{ ...button, marginLeft: "auto" }}>
                Next: your interview →
              </button>
            )}
          </div>
        )}

        {!started && !pastEditor && (
          <GlassCard style={{ padding: "40px 32px", textAlign: "center", marginTop: "6vh" }}>
            <div style={{ fontFamily: "var(--font-lora), serif", fontSize: 28, color: "var(--text-primary)" }}>Editor review</div>
            <p style={{ margin: "12px auto 0", maxWidth: 480, fontSize: 15, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              A senior editor reads every chapter the way an agent would and finds what&apos;s missing. Then T.H.E.O. interviews you about it, and your answers go into the book.
              While the editor reads, you&apos;ll pick which lines sound like you.
            </p>
            {undrafted.length > 0 ? (
              <p style={{ margin: "18px 0 0", fontSize: 14, color: "#B4532A" }}>
                {undrafted.length} chapter{undrafted.length === 1 ? " isn't" : "s aren't"} drafted yet.{" "}
                <button onClick={() => router.push(`/project/${projectId}/generate`)} style={{ border: "none", background: "none", color: "#A05526", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 14 }}>Finish the first draft</button>
              </p>
            ) : (
              <>
                <button onClick={startEditor} style={{ ...button, marginTop: 22 }}>Start the editor</button>
                <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--text-tertiary)" }}>About {estimate.toLocaleString()} Ink for the review, interview and rewrite.</p>
              </>
            )}
            <p style={{ margin: "18px 0 0", fontSize: 13 }}>
              <button onClick={() => router.push(`/project/${projectId}/editor`)} style={{ border: "none", background: "none", color: "var(--text-secondary)", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: 13 }}>
                Skip the review and go to your final draft
              </button>
            </p>
          </GlassCard>
        )}

        {(pr.error || startError) && <div role="alert" style={{ color: "#B4532A", fontSize: 13 }}>{pr.error || startError}</div>}

        {/* Dead center while the editor reads: the picker, pair after pair until it's done. */}
        {started && !pastEditor && (
          <GlassCard style={{ padding: "32px clamp(18px, 4vw, 36px)", marginTop: "2vh" }}>
            <div data-tut="pr-picker"><VoicePicker projectId={projectId} active={editing} /></div>
          </GlassCard>
        )}

        {editPasses.length > 0 && (allRead || pastEditor) && (
          <GlassCard style={{ padding: 28 }}>
            <div data-tut="pr-editor-notes"><PanelTitle>What the editor saw</PanelTitle></div>
            <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
              {chapters.map((ch) => {
                const pass = editPasses.find((p) => p.chapter_id === ch.id);
                if (!pass?.scores) return null;
                const scores = Object.fromEntries(Object.entries(pass.scores).filter(([, v]) => typeof v === "number")) as Record<string, number>;
                return (
                  <div key={ch.id} style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      Ch {ch.chapter_number}: {ch.title} <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>· first draft: {bandFor(scores)}</span>
                    </div>
                    {typeof pass.scores.summary === "string" && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{pass.scores.summary}</div>}
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 14 }}>
              This is D.Scribe&apos;s own measure of how ready a chapter reads. It is not a prediction of any agent&apos;s or publisher&apos;s decision.
            </p>
          </GlassCard>
        )}
      </div>
      {showUpgrade && <InkUpgradeModal onClose={() => setShowUpgrade(false)} />}
    </PageShell>
  );
}
