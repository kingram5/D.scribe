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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const next = cards.findIndex((c, i) => i > index && !answers[c.id]);
    if (next >= 0 && !ready) { setIndex(next); setPhase("moments"); }
    else { setIndex(0); setPhase(!ready ? "clarify" : "done"); }
  }

  async function choose(importance: Importance) {
    if (!card) return;
    const next = { card_id: card.id, importance, context: answers[card.id]?.context || "", clarification_answer: answers[card.id]?.clarification_answer || "" };
    if (!(await save(card, next))) return;
    if (importance === "essential") { setPhase("context"); }
    else nextMoment();
  }

  async function chooseDirection(direction: string) {
    if (!card || !answers[card.id]) return;
    const next = { ...answers[card.id], ...(phase === "context" ? { context: direction } : { clarification_answer: direction }) };
    if (!(await save(card, next))) return;
    if (ready) { onFinish(); return; }
    if (phase === "clarify") {
      if (index + 1 >= clarificationCards.length) setPhase("done");
      else setIndex(index + 1);
    } else nextMoment();
  }

  function skipQuestion() {
    if (ready) onFinish();
    else if (phase === "clarify") {
      if (index + 1 < clarificationCards.length) setIndex(index + 1);
      else setPhase("done");
    } else nextMoment();
  }

  const usageChoices = [
    { label: "Opening story", value: "Editorial preference: consider this passage as an opening story in a relevant chapter. Use only facts present in the transcript." },
    { label: "Supporting example", value: "Editorial preference: use this passage as a concise example supporting a relevant idea." },
    { label: "Key takeaway", value: "Editorial preference: emphasize the lesson supported by this passage, without inventing facts or experiences." },
    { label: "Let Theo decide", value: "Editorial preference: let Theo choose the role that best fits this passage." },
  ];
  const takeawayChoices = [
    { label: "What changed", value: "Editorial preference: emphasize the change or turning point supported by this passage." },
    { label: "What was learned", value: "Editorial preference: emphasize lessons that are actually supported by this passage." },
    { label: "Why it mattered", value: "Editorial preference: emphasize the significance already expressed in this passage." },
    { label: "What readers can use", value: "Editorial preference: emphasize practical insights supported by this passage. Do not invent advice." },
    { label: "Let Theo decide", value: "Editorial preference: let Theo choose the reader takeaway supported by this passage." },
  ];
  const editing = phase === "context" || phase === "clarify";
  return (
    <section className="ds-analysis-moments" aria-labelledby="analysis-moments-title">
      <div className="ds-analysis-moments__status" role="status" aria-live="polite">
        <span className="ds-analysis-moments__dot" aria-hidden />
        {ready ? "Themes and voice are ready" : step || "Theo is analyzing your words…"}
      </div>
      <h1 id="analysis-moments-title">What matters most?</h1>
      <p className="ds-analysis-moments__intro">While Theo reads, pick what belongs in your book. Every choice is optional—just tap your answer.</p>
      {ready && <p className="ds-analysis-moments__ready" role="status">Pick one last direction or build your outline with your saved choices.</p>}
      <div className="ds-analysis-moments__card">
        {loading ? <p>Finding moments in your transcript…</p> : card && phase !== "done" ? (
          <>
            <div className="ds-analysis-moments__eyebrow">{phase === "clarify" ? "A little clarity" : `Moment ${index + 1} of ${cards.length}`} · {card.speaker}</div>
            <blockquote>{card.excerpt}</blockquote>
            {editing ? (
              <>
                <h2>{phase === "context" ? "How should Theo use this moment?" : "What should readers take from this?"}</h2>
                <p>{phase === "context" ? "Choose the role it could play in your book." : "Choose what Theo should emphasize, using the details already in your transcript."}</p>
                <div className="ds-analysis-moments__actions">
                  {(phase === "context" ? usageChoices : takeawayChoices).map(choice => (
                    <button key={choice.label} type="button" style={buttonStyle} disabled={busy}
                      aria-pressed={(phase === "context" ? answers[card.id]?.context : answers[card.id]?.clarification_answer) === choice.value}
                      onClick={() => chooseDirection(choice.value)}>{choice.label}</button>
                  ))}
                  <button type="button" style={buttonStyle} disabled={busy} onClick={skipQuestion}>Skip this question</button>
                </div>
                <small>{busy ? "Saving your choice…" : "Your picks guide Theo. They don't add new facts to your story."}</small>
              </>
            ) : (
              <>
                <h2>How important is this to your book?</h2>
                <div className="ds-analysis-moments__actions">
                  <button type="button" style={{ ...buttonStyle, background: "#C17A47", color: "#fff", borderColor: "#C17A47" }} aria-pressed={answers[card.id]?.importance === "essential"} disabled={busy} onClick={() => choose("essential")}>Essential</button>
                  <button type="button" style={buttonStyle} aria-pressed={answers[card.id]?.importance === "supporting"} disabled={busy} onClick={() => choose("supporting")}>Supporting</button>
                  <button type="button" style={buttonStyle} aria-pressed={answers[card.id]?.importance === "exclude"} disabled={busy} onClick={() => choose("exclude")}>Leave out</button>
                </div>
                {index > 0 && <button type="button" style={buttonStyle} disabled={busy} onClick={() => { setIndex(index - 1); }}>Previous moment</button>}
                {!ready && <button type="button" style={buttonStyle} disabled={busy} onClick={nextMoment}>Skip this moment</button>}
              </>
            )}
          </>
        ) : (
          <>
            <h2>{savedCount ? "You've given Theo a clearer picture" : "Theo is reading your transcript"}</h2>
            {cards.length > 0 && <button type="button" style={buttonStyle} onClick={() => { setIndex(0); setPhase("moments"); }}>Review my choices</button>}
            <p>{savedCount ? `${essentialCount} essential moments · ${contextCount} moments with a chosen direction. Your saved choices guide the outline and drafts.` : "You can simply watch the analysis. Your original transcript stays intact."}</p>
          </>
        )}
        {error && <p role="alert" className="ds-analysis-moments__error">{error}</p>}
      </div>
      <div className="ds-analysis-moments__footer">
        <span>{savedCount ? `${savedCount} choices saved` : "Skip whenever you like"}</span>
        <button type="button" style={buttonStyle} disabled={busy} onClick={onFinish}>{ready ? "Build my outline" : "I'm done · watch Analysis"}</button>
      </div>
    </section>
  );
}
