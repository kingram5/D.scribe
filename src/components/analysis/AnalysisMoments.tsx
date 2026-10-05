"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisMoment, Importance } from "@/lib/analysis-moments";

interface SavedAnswer { card_id: string; importance: Importance; context: string; clarification_answer: string }
const buttonStyle: React.CSSProperties = {
  minHeight: 44, padding: "10px 18px", borderRadius: 9999, border: "1px solid var(--ds-input-border, #D8CFBE)",
  background: "transparent", color: "var(--text-primary, #2C2419)", fontSize: 14, fontWeight: 600, cursor: "pointer",
};

/** One optional editorial decision at a time. The run stays independent of card loading. */
export default function AnalysisMoments({ projectId, step, ready, onFinish }: {
  projectId: string; step: string | null; ready: boolean; onFinish: () => void;
}) {
  const [cards, setCards] = useState<AnalysisMoment[]>([]);
  const [answers, setAnswers] = useState<Record<string, SavedAnswer>>({});
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"moments" | "context" | "clarify" | "done">("moments");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    fetch(`/api/analysis-moments?project_id=${projectId}`)
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; })
      .then(data => {
        if (cancelled) return;
        const responses = Object.fromEntries((data.responses as SavedAnswer[]).map(a => [a.card_id, a]));
        setCards(data.cards);
        setAnswers(responses);
        const first = (data.cards as AnalysisMoment[]).findIndex(c => !responses[c.id]);
        setIndex(first >= 0 ? first : 0);
        if (first === -1) setPhase("done");
      })
      .catch(e => { if (!cancelled) { setError(e.message || "Couldn't load your moments."); setPhase("done"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach(t => t.stop());
    };
  }, [projectId]);

  const clarificationCards = cards.filter(c => answers[c.id] && answers[c.id].importance !== "exclude").slice(0, 3);
  const card = phase === "clarify" ? clarificationCards[index] : cards[index];
  const savedCount = Object.keys(answers).length;
  const essentialCount = Object.values(answers).filter(a => a.importance === "essential").length;
  const contextCount = Object.values(answers).filter(a => a.context.trim()).length;

  async function save(card: AnalysisMoment, next: SavedAnswer) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/analysis-moments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, ...next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save. Please retry.");
      if (mounted.current) setAnswers(previous => ({ ...previous, [card.id]: next }));
      return true;
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Couldn't save. Please retry."); return false; }
    finally { if (mounted.current) setBusy(false); }
  }

  function nextMoment() {
    setText("");
    const next = cards.findIndex((c, i) => i > index && !answers[c.id]);
    if (next >= 0 && !ready) { setIndex(next); setPhase("moments"); }
    else { setIndex(0); setPhase(!ready ? "clarify" : "done"); }
  }

  async function choose(importance: Importance) {
    if (!card) return;
    const next = { card_id: card.id, importance, context: answers[card.id]?.context || "", clarification_answer: answers[card.id]?.clarification_answer || "" };
    if (!(await save(card, next))) return;
    if (importance === "essential") { setText(next.context); setPhase("context"); }
    else nextMoment();
  }

  async function saveText(finish = false) {
    if (!card) { if (finish) onFinish(); return; }
    const previous = answers[card.id];
    if (!previous) return;
    const next = { ...previous, ...(phase === "context" ? { context: text } : { clarification_answer: text }) };
    if (!(await save(card, next))) return;
    setText("");
    if (finish) { onFinish(); return; }
    if (phase === "clarify") {
      if (ready || index + 1 >= clarificationCards.length) setPhase("done");
      else setIndex(index + 1);
    } else nextMoment();
  }

  async function toggleRecording() {
    if (recording) { recorder.current?.stop(); return; }
    setError(null); setBusy(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      const rec = new MediaRecorder(media, { audioBitsPerSecond: 32000 });
      recorder.current = rec;
      const chunks: Blob[] = [];
      let bytes = 0;
      const start = Date.now();
      rec.ondataavailable = event => {
        if (!event.data.size) return;
        chunks.push(event.data); bytes += event.data.size;
        if (bytes >= 3.5 * 1024 * 1024 && rec.state === "recording") rec.stop();
      };
      rec.onstop = async () => {
        media.getTracks().forEach(t => t.stop());
        if (timer.current) clearTimeout(timer.current);
        if (!mounted.current) return;
        setRecording(false); setBusy(true);
        try {
          const type = rec.mimeType || "audio/webm";
          const blob = new Blob(chunks, { type });
          const res = await fetch(`/api/analysis-moments/stt?project_id=${projectId}&seconds=${Math.ceil((Date.now() - start) / 1000)}`, { method: "POST", headers: { "Content-Type": type }, body: blob });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          if (mounted.current) {
            if (data.transcript) setText(previous => `${previous}${previous ? " " : ""}${data.transcript}`.slice(0, phase === "clarify" ? 3000 : 6000));
            else setError("No words were heard. Try again or type your answer.");
          }
        } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Couldn't transcribe that."); }
        finally { if (mounted.current) setBusy(false); }
      };
      rec.start(1000); setRecording(true); setBusy(false);
      timer.current = setTimeout(() => { if (rec.state === "recording") rec.stop(); }, 180000);
    } catch { stream.current?.getTracks().forEach(t => t.stop()); setBusy(false); setError("Microphone unavailable. You can type your answer instead."); }
  }

  const editing = phase === "context" || phase === "clarify";
  return (
    <section className="ds-analysis-moments" aria-labelledby="analysis-moments-title">
      <div className="ds-analysis-moments__status" role="status" aria-live="polite">
        <span className="ds-analysis-moments__dot" aria-hidden />
        {ready ? "Themes and voice are ready" : step || "Theo is analyzing your words…"}
      </div>
      <h1 id="analysis-moments-title">What matters most?</h1>
      <p className="ds-analysis-moments__intro">While Theo reads, help him understand what belongs in your book. Every choice is optional.</p>
      {ready && <p className="ds-analysis-moments__ready" role="status">Finish your current thought, then {"build your outline with your saved choices"}.</p>}
      <div className="ds-analysis-moments__card">
        {loading ? <p>Finding moments in your transcript…</p> : card && phase !== "done" ? (
          <>
            <div className="ds-analysis-moments__eyebrow">{phase === "clarify" ? "A little clarity" : `Moment ${index + 1} of ${cards.length}`} · {card.speaker}</div>
            <blockquote>{card.excerpt}</blockquote>
            {editing ? (
              <>
                <h2>{phase === "context" ? "Tell me a little more" : "What did you mean here?"}</h2>
                <p>{phase === "context" ? (card.is_author ? "What happened next, or why did this moment matter to you?" : "What context should readers have about this speaker's words?") : card.clarification}</p>
                <label htmlFor="analysis-moment-answer" className="ds-analysis-moments__eyebrow">{phase === "context" ? "Additional context" : "Your clarification"}</label>
                <textarea id="analysis-moment-answer" value={text} onChange={e => setText(e.target.value)} maxLength={phase === "clarify" ? 3000 : 6000} rows={5} disabled={busy || recording} placeholder="A few sentences are enough…" />
                <div className="ds-analysis-moments__actions">
                  <button type="button" style={buttonStyle} disabled={busy} onClick={toggleRecording}>{recording ? "Stop recording" : "Record a little more"}</button>
                  <button type="button" style={{ ...buttonStyle, background: "#C17A47", color: "#fff", borderColor: "#C17A47" }} disabled={busy || recording} onClick={() => saveText(ready)}>{busy ? "Saving…" : ready ? "Save & build outline" : "Save & next"}</button>
                  {!text.trim() && <button type="button" style={buttonStyle} disabled={busy || recording} onClick={() => {
                    if (ready) onFinish();
                    else if (phase === "clarify") { if (index + 1 < clarificationCards.length) setIndex(index + 1); else setPhase("done"); }
                    else nextMoment();
                  }}>Skip this question</button>}
                </div>
                <small>Spoken answers use transcription Ink. Review the text before saving.</small>
              </>
            ) : (
              <>
                <h2>How important is this to your book?</h2>
                <div className="ds-analysis-moments__actions">
                  <button type="button" style={{ ...buttonStyle, background: "#C17A47", color: "#fff", borderColor: "#C17A47" }} aria-pressed={answers[card.id]?.importance === "essential"} disabled={busy} onClick={() => choose("essential")}>Essential</button>
                  <button type="button" style={buttonStyle} aria-pressed={answers[card.id]?.importance === "supporting"} disabled={busy} onClick={() => choose("supporting")}>Supporting</button>
                  <button type="button" style={buttonStyle} aria-pressed={answers[card.id]?.importance === "exclude"} disabled={busy} onClick={() => choose("exclude")}>Leave out</button>
                </div>
                {index > 0 && <button type="button" style={buttonStyle} disabled={busy} onClick={() => { setIndex(index - 1); setText(""); }}>Previous moment</button>}
                {!ready && <button type="button" style={buttonStyle} disabled={busy} onClick={nextMoment}>Skip this moment</button>}
              </>
            )}
          </>
        ) : (
          <>
            <h2>{savedCount ? "You've given Theo a clearer picture" : "Theo is reading your transcript"}</h2>
            {cards.length > 0 && <button type="button" style={buttonStyle} onClick={() => { setIndex(0); setPhase("moments"); }}>Review my choices</button>}
            <p>{savedCount ? `${essentialCount} essential moments · ${contextCount} stories with added context. Your saved choices guide the outline and drafts.` : "You can simply watch the analysis. Your original transcript stays intact."}</p>
          </>
        )}
        {error && <p role="alert" className="ds-analysis-moments__error">{error}</p>}
      </div>
      <div className="ds-analysis-moments__footer">
        <span>{savedCount ? `${savedCount} choices saved` : "Skip whenever you like"}</span>
        <button type="button" style={buttonStyle} disabled={busy || recording || (editing && !!text.trim())} onClick={onFinish}>{ready ? "Build my outline" : "I'm done · watch Analysis"}</button>
      </div>
    </section>
  );
}
