import { describe, it } from "vitest";
import fs from "fs";
import path from "path";
import { PERSONAS } from "./personas";
import { RUBRIC, codeMetrics, judgePair, runSession, usd, type Arm, type SessionResult, type Usage } from "./harness";

// Load the project's own key the same way Next does, without adding a dependency.
for (const line of fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8").split(/\r?\n/) : []) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const TURNS = Number(process.env.THEO_EVAL_TURNS || 12);
const ONLY = (process.env.THEO_EVAL_PERSONAS || "").split(",").map((s) => s.trim()).filter(Boolean);
const INK_PER_DOLLAR = 91;

const sum = (us: Usage[]) => us.reduce((n, u) => n + usd(u), 0);
const tok = (us: Usage[]) => us.reduce((t, u) => ({ input: t.input + u.input, output: t.output + u.output, cacheRead: t.cacheRead + u.cacheRead, cacheWrite: t.cacheWrite + u.cacheWrite }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

describe("Theo: production vs v2, blind", () => {
  it("runs the interviews and writes the report", async () => {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing (.env.local)");
    const personas = PERSONAS.filter((p) => ONLY.length === 0 || ONLY.includes(p.id));
    const outDir = path.resolve("evals/theo/results");
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

    const rows: string[] = [];
    const agg: Record<Arm, { facts: number; factsTotal: number; share: number[]; theoWords: number[]; multi: number; invented: number; callbacks: number; repeated: number; dashes: number; rubric: Record<string, number>; cost: number; turns: number }> = {
      baseline: { facts: 0, factsTotal: 0, share: [], theoWords: [], multi: 0, invented: 0, callbacks: 0, repeated: 0, dashes: 0, rubric: {}, cost: 0, turns: 0 },
      v2: { facts: 0, factsTotal: 0, share: [], theoWords: [], multi: 0, invented: 0, callbacks: 0, repeated: 0, dashes: 0, rubric: {}, cost: 0, turns: 0 },
    };
    const wins: Record<string, number> = { baseline: 0, v2: 0, tie: 0 };
    let judgeCost = 0;
    const v2Cost = { theo: 0, scribe: 0, recap: 0, sessions: 0, turns: 0, theoTok: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    const baseCost = { theo: 0, sessions: 0, turns: 0 };

    // Both arms of every author run side by side; authors run in parallel.
    const sessions = await Promise.all(personas.map(async (p) => {
      const [baseline, v2] = await Promise.all([runSession(p, "baseline", TURNS), runSession(p, "v2", TURNS)]);
      const judged = await judgePair(baseline, v2);
      return { p, baseline, v2, judged };
    }));

    for (const { p, baseline, v2, judged } of sessions) {
      judgeCost += sum(judged.usage);
      wins[judged.better]++;
      for (const s of [baseline, v2] as SessionResult[]) {
        const m = codeMetrics(s, p);
        const a = agg[s.arm];
        a.facts += m.factsFound; a.factsTotal += m.factsTotal; a.share.push(m.authorShare); a.theoWords.push(m.avgTheoWords);
        a.multi += m.multiQuestionTurns; a.invented += m.inventedQuotes; a.callbacks += m.callbacks; a.repeated += m.repeatedQuestions; a.dashes += m.emDashes;
        a.turns += s.turns.length;
        const cost = sum(s.usage.theo) + sum(s.usage.scribe) + sum(s.usage.recap);
        a.cost += cost;
        for (const [k, v] of Object.entries(judged.scores[s.arm])) a.rubric[k] = (a.rubric[k] ?? 0) + v;
        rows.push(`| ${p.id} | ${s.arm} | ${m.factsFound}/${m.factsTotal} | ${(m.authorShare * 100).toFixed(0)}% | ${m.avgTheoWords.toFixed(0)} | ${m.multiQuestionTurns} | ${m.inventedQuotes} | ${m.callbacks} | ${m.repeatedQuestions} | ${Object.values(judged.scores[s.arm]).reduce((x, y) => x + y, 0)}/12 | $${cost.toFixed(4)} |`);
      }
      v2Cost.theo += sum(v2.usage.theo); v2Cost.scribe += sum(v2.usage.scribe); v2Cost.recap += sum(v2.usage.recap); v2Cost.sessions++; v2Cost.turns += v2.turns.length;
      const tt = tok(v2.usage.theo); for (const k of Object.keys(tt) as (keyof typeof tt)[]) v2Cost.theoTok[k] += tt[k];
      baseCost.theo += sum(baseline.usage.theo); baseCost.sessions++; baseCost.turns += baseline.turns.length;
      fs.writeFileSync(path.join(outDir, `${stamp}-${p.id}.json`), JSON.stringify({ persona: p.id, judged: { scores: judged.scores, better: judged.better, why: judged.why }, baseline, v2 }, null, 1));
    }

    const avg = (xs: number[]) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 0);
    const n = sessions.length;
    const perTurnV2 = v2Cost.turns ? (v2Cost.theo + v2Cost.scribe) / v2Cost.turns : 0;
    const perTurnBase = baseCost.turns ? baseCost.theo / baseCost.turns : 0;
    const session25 = (perTurn: number, recap: number) => perTurn * 25 + recap;
    const v2Session = session25(perTurnV2, n ? v2Cost.recap / n : 0);
    const baseSession = session25(perTurnBase, 0);

    const report = [
      `# Theo evaluation, ${stamp}`,
      ``,
      `${n} simulated authors, ${TURNS} exchanges each, two arms: **baseline** = Theo as he runs on master today (${"claude-haiku-4-5"}), **v2** = this branch (claude-sonnet-4-6 + the haiku note-taker + the recap). Authors are played by claude-haiku-4-5 and hide five buried facts each. Judged blind by claude-sonnet-4-6, twice with the labels swapped, lower score kept.`,
      ``,
      `## Headline`,
      `| | baseline | v2 |`,
      `|---|---|---|`,
      `| Buried facts found | ${agg.baseline.facts}/${agg.baseline.factsTotal} | ${agg.v2.facts}/${agg.v2.factsTotal} |`,
      `| Blind head-to-head wins | ${wins.baseline} | ${wins.v2} (ties ${wins.tie}) |`,
      `| Rubric total (max ${n * 12}) | ${Object.values(agg.baseline.rubric).reduce((x, y) => x + y, 0)} | ${Object.values(agg.v2.rubric).reduce((x, y) => x + y, 0)} |`,
      `| Author's share of the words | ${(avg(agg.baseline.share) * 100).toFixed(0)}% | ${(avg(agg.v2.share) * 100).toFixed(0)}% |`,
      `| Theo's words per turn | ${avg(agg.baseline.theoWords).toFixed(0)} | ${avg(agg.v2.theoWords).toFixed(0)} |`,
      `| Turns with more than one question | ${agg.baseline.multi} | ${agg.v2.multi} |`,
      `| Invented quotes (must be 0) | ${agg.baseline.invented} | ${agg.v2.invented} |`,
      `| Spoken callbacks | ${agg.baseline.callbacks} | ${agg.v2.callbacks} (${agg.v2.turns ? (agg.v2.callbacks / agg.v2.turns * 5).toFixed(2) : "0"} per 5 turns; cap is 1) |`,
      `| Repeated questions | ${agg.baseline.repeated} | ${agg.v2.repeated} |`,
      `| Turns containing an em dash | ${agg.baseline.dashes} | ${agg.v2.dashes} |`,
      ``,
      `## Rubric by line (sum over authors, max ${n * 2} each)`,
      `| line | baseline | v2 |`,
      `|---|---|---|`,
      ...RUBRIC.map((r) => { const k = r.split(":")[0]; return `| ${r} | ${agg.baseline.rubric[k] ?? 0} | ${agg.v2.rubric[k] ?? 0} |`; }),
      ``,
      `## Measured cost (list prices; 1-hour cache writes at 2x input)`,
      `| | baseline | v2 |`,
      `|---|---|---|`,
      `| Vendor cost per exchange | $${perTurnBase.toFixed(5)} | $${perTurnV2.toFixed(5)} (Theo $${(v2Cost.turns ? v2Cost.theo / v2Cost.turns : 0).toFixed(5)} + note-taker $${(v2Cost.turns ? v2Cost.scribe / v2Cost.turns : 0).toFixed(5)}) |`,
      `| Recap per session | none | $${(n ? v2Cost.recap / n : 0).toFixed(5)} |`,
      `| **25-exchange session** | **$${baseSession.toFixed(4)}** | **$${v2Session.toFixed(4)}** |`,
      `| Same session in Ink at ${INK_PER_DOLLAR} Ink per vendor dollar | ${(baseSession * INK_PER_DOLLAR).toFixed(1)} | ${(v2Session * INK_PER_DOLLAR).toFixed(1)} |`,
      `| v2 Theo tokens, all sessions | | input ${v2Cost.theoTok.input.toLocaleString()} · cache read ${v2Cost.theoTok.cacheRead.toLocaleString()} · cache write ${v2Cost.theoTok.cacheWrite.toLocaleString()} · output ${v2Cost.theoTok.output.toLocaleString()} |`,
      ``,
      `Judging cost $${judgeCost.toFixed(3)}. Whole run about $${(agg.baseline.cost + agg.v2.cost + judgeCost).toFixed(2)} plus the simulated authors.`,
      ``,
      `## Per author`,
      `| author | arm | facts | author share | Theo words/turn | multi-Q turns | invented quotes | callbacks | repeats | rubric | vendor cost |`,
      `|---|---|---|---|---|---|---|---|---|---|---|`,
      ...rows,
      ``,
      `## Judges' one-liners`,
      ...sessions.map((s) => `- **${s.p.id}**: ${s.judged.better} — ${s.judged.why}`),
      ``,
      `Caveats: simulated authors are easier and more consistent than real ones; six authors is a small sample; the judge is a model. Full transcripts are beside this file.`,
    ].join("\n");

    fs.writeFileSync(path.join(outDir, `${stamp}-REPORT.md`), report);
    console.log("\n" + report + "\n");
  }, 60 * 60 * 1000);
});
