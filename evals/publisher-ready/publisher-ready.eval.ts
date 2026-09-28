import { describe, it } from "vitest";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { extractExcerptsForChapter } from "@/lib/chunker";
import { projectSourceText, speakersIn, hasOtherSpeakers, keyPointForPrompt, keyPointSpeakerColumns, type LabeledTranscript } from "@/lib/speakers";
import {
  runArmA, runArmB, runPrFront, runPrBack, judge, codeMetrics, rubricTotal, RUBRIC_MAX,
  type Arm, type ArmResult, type Fixture,
} from "./harness";
import { estimateChapterUsd, INK_PER_VENDOR_DOLLAR } from "@/lib/publisher-ready/estimate";

// Load the project's own keys the same way Next does, without adding a dependency.
for (const line of fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8").split(/\r?\n/) : []) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const ROOT = path.resolve("evals/publisher-ready");
const FIXTURES = path.join(ROOT, "fixtures");
const RESULTS = path.join(ROOT, "results");
const ANSWERS = path.join(ROOT, "answers");
const PHASE = process.env.PR_EVAL_PHASE || "";
const CONFIRM = process.env.PR_EVAL_CONFIRM === "yes";
const readJson = <T>(p: string): T => JSON.parse(fs.readFileSync(p, "utf8")) as T;
const writeJson = (p: string, v: unknown) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2)); };
// PR_EVAL_ONLY=substring limits a run to matching fixture ids (e.g. "-other").
const ONLY = process.env.PR_EVAL_ONLY || "";
const loadFixtures = (): Fixture[] =>
  fs.existsSync(FIXTURES) ? fs.readdirSync(FIXTURES).filter((f) => f.endsWith(".json") && (!ONLY || f.includes(ONLY))).map((f) => readJson<Fixture>(path.join(FIXTURES, f))) : [];

/** Rough pre-run price so nobody spends by accident. */
function priceEstimate(fixtures: Fixture[]): number {
  return fixtures.reduce((sum, f) => {
    const pr = estimateChapterUsd(f.input.targetWords);
    const single = 0.05 + 0.03 * (f.input.targetWords / 1000);
    const judging = 4 * 2 * 0.06; // 4 arms x 2 judges
    return sum + single * 2 + pr * 2 + judging;
  }, 0);
}

describe("Publisher-Ready scoreboard", () => {
  it(`phase: ${PHASE || "(none)"}`, async () => {
    if (!PHASE) {
      console.log("Set PR_EVAL_PHASE to export, questions or final. See evals/publisher-ready/README.md.");
      return;
    }

    // ── Phase 1: export real chapters (read-only) ──────────────────────────
    if (PHASE === "export") {
      const picks = (process.env.PR_EVAL_CHAPTERS || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!picks.length) throw new Error("PR_EVAL_CHAPTERS=<chapter uuid>,<chapter uuid>,… required");
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      for (const id of picks) {
        const { data: ch } = await db.from("chapters").select("*").eq("id", id).single();
        if (!ch) throw new Error(`chapter ${id} not found`);
        const { data: project } = await db.from("projects").select("*").eq("id", ch.project_id).single();
        const [{ data: ts }, { data: kps }, { data: prev }, { data: siblings }] = await Promise.all([
          db.from("transcripts").select("*").eq("project_id", ch.project_id),
          db.from("key_points").select("*").in("id", ch.key_point_ids || []),
          db.from("chapters").select("title, summary").eq("project_id", ch.project_id).lt("chapter_number", ch.chapter_number).gt("chapter_number", 0).order("chapter_number"),
          db.from("chapters").select("id, chapter_number").eq("project_id", ch.project_id).neq("id", id),
        ]);
        const otherChapters: Record<string, string> = {};
        for (const s of siblings || []) {
          const { data: c } = await db.from("chapter_contents").select("content").eq("chapter_id", s.id).order("version", { ascending: false }).limit(1).maybeSingle();
          if (c?.content) otherChapters[`Chapter ${s.chapter_number}`] = c.content;
        }
        // PR_EVAL_OTHER_SPEAKER="Name|relationship" labels every voice in these recordings as that
        // person (e.g. a sermon the book's author did not preach), to test the speaker-label path.
        const other = (process.env.PR_EVAL_OTHER_SPEAKER || "").split("|");
        const txs: LabeledTranscript[] = (ts || []).map((t) => other[0]
          ? { ...t, speaker_map: Object.fromEntries(speakersIn(t.segments).map((sp) => [sp, { role: "other" as const, name: other[0], relationship: other[1] || undefined }])) }
          : t);
        const fullText = projectSourceText(txs);
        const kpOwner = (k: { supporting_quotes?: string[] }) => other[0] ? { speaker_role: "other" as const, speaker_name: other[0] } : txs.reduce((acc, t) => acc ?? (keyPointSpeakerColumns(t, k.supporting_quotes || []).speaker_role ? keyPointSpeakerColumns(t, k.supporting_quotes || []) : null), null as null | Record<string, unknown>) ?? {};
        const fixture: Fixture = {
          id: `${String(project?.title || "book").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40)}-ch${ch.chapter_number}${other[0] ? "-other" : ""}`,
          otherChapters,
          input: {
            projectTitle: project?.title ?? "",
            audience: project?.audience,
            scriptureTranslation: project?.scripture_translation,
            voiceProfile: project?.voice_profile ?? null,
            styleMemoryBlock: "",
            chapterNumber: ch.chapter_number,
            chapterTitle: ch.title,
            chapterSummary: ch.summary,
            keyPoints: (kps || []).map((k) => keyPointForPrompt({ title: k.title, summary: k.summary, ...kpOwner(k) })).map((k) => ({ title: k.title, summary: k.summary })),
            otherSpeakers: txs.some(hasOtherSpeakers),
            previousChapters: prev || [],
            excerpts: extractExcerptsForChapter(fullText, (kps || []).map((k) => k.supporting_quotes || [])),
            targetWords: ch.target_word_count,
          },
        };
        writeJson(path.join(FIXTURES, `${fixture.id}.json`), fixture);
        console.log(`exported ${fixture.id}`);
      }
      return;
    }

    const fixtures = loadFixtures();
    if (!fixtures.length) throw new Error("No fixtures. Run PR_EVAL_PHASE=export first.");
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing (.env.local)");

    // ── Phase 2: arms A/B in full, arms C/D up to the editor's questions ───
    if (PHASE === "questions") {
      const est = priceEstimate(fixtures);
      console.log(`Estimated spend for the whole scoreboard (both phases): ~$${est.toFixed(2)} for ${fixtures.length} chapter(s).`);
      if (!CONFIRM) { console.log("Dry run. Re-run with PR_EVAL_CONFIRM=yes to spend."); return; }
      for (const f of fixtures) {
        const [a, b, c, d] = await Promise.all([runArmA(f), runArmB(f), runPrFront(f, "C"), runPrFront(f, "D")]);
        for (const r of [a, b, c, d]) writeJson(path.join(RESULTS, f.id, `${r.arm}.json`), r);
        // One answer sheet per PR arm: the author fills "answer" in their own words, or leaves it blank.
        for (const r of [c, d]) {
          writeJson(path.join(ANSWERS, `${f.id}-${r.arm}.json`), r.editor!.author_questions.map((q, i) => ({
            id: `Q${i + 1}`, impact: q.impact, question: q.question, why: q.why, answer: "",
          })));
        }
        console.log(`${f.id}: C asked ${c.editor!.author_questions.length}, D asked ${d.editor!.author_questions.length}`);
      }
      console.log(`Answer sheets written to ${ANSWERS}. Fill them in, then run PR_EVAL_PHASE=final.`);
      return;
    }

    // ── Phase 3: finish C/D with the answers, judge everything blind, report ─
    if (PHASE === "final") {
      if (!CONFIRM) { console.log("Re-run with PR_EVAL_CONFIRM=yes to spend."); return; }
      const rows: { fixture: string; arm: Arm; total: number; scores: Record<string, number>; dollars: number; slowest: number; worst: string; code: ReturnType<typeof codeMetrics> }[] = [];
      let judgeDollars = 0;
      for (const f of fixtures) {
        const arms: ArmResult[] = [];
        for (const arm of ["A", "B"] as const) arms.push(readJson<ArmResult>(path.join(RESULTS, f.id, `${arm}.json`)));
        for (const arm of ["C", "D"] as const) {
          const front = readJson<ArmResult>(path.join(RESULTS, f.id, `${arm}.json`));
          const sheetPath = path.join(ANSWERS, `${f.id}-${arm}.json`);
          const sheet = fs.existsSync(sheetPath) ? readJson<{ id: string; answer: string }[]>(sheetPath) : [];
          const answers = Object.fromEntries(sheet.map((s) => [s.id, s.answer]));
          const done = front.final ? front : await runPrBack(f, front, answers);
          writeJson(path.join(RESULTS, f.id, `${arm}.json`), done);
          arms.push(done);
        }
        // Judge in shuffled order so position can't leak the arm.
        const order = [...arms].sort(() => Math.random() - 0.5);
        for (const r of order) {
          const j = await judge(f, r.final!);
          judgeDollars += j.dollars;
          rows.push({ fixture: f.id, arm: r.arm, total: rubricTotal(j.scores), scores: j.scores, dollars: r.dollars, slowest: Math.max(0, ...Object.values(r.seconds ?? {})), worst: j.worst, code: codeMetrics(r.final!) });
        }
      }

      const byArm = (arm: Arm) => rows.filter((r) => r.arm === arm);
      const avg = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / Math.max(1, ns.length);
      const words = avg(fixtures.map((f) => f.input.targetWords));
      const lines = [
        `# Publisher-Ready scoreboard (${new Date().toISOString().slice(0, 16)})`,
        "",
        `${fixtures.length} chapter(s), rubric max ${RUBRIC_MAX}, lower of two judges per criterion. Judging cost $${judgeDollars.toFixed(2)}.`,
        "",
        "| Arm | Avg rubric | Tells score | Rhythm | $ / chapter | $ / 40k-word book* | Ink / book* | Slowest step (s)** |",
        "|---|---|---|---|---|---|---|---|",
        ...(["A", "B", "C", "D"] as Arm[]).map((arm) => {
          const rs = byArm(arm);
          const perChapter = avg(rs.map((r) => r.dollars));
          const perBook = perChapter * (40000 / Math.max(500, words));
          return `| ${arm} | ${avg(rs.map((r) => r.total)).toFixed(1)} | ${avg(rs.map((r) => r.code.tellsScore)).toFixed(0)} | ${avg(rs.map((r) => r.code.rhythm)).toFixed(2)} | $${perChapter.toFixed(3)} | $${perBook.toFixed(2)} | ${Math.round(perBook * INK_PER_VENDOR_DOLLAR)} | ${Math.max(0, ...rs.map((r) => r.slowest)).toFixed(0)} |`;
        }),
        "",
        `*Book figures scale the measured per-chapter cost to 40,000 words at the average chapter length here (${Math.round(words)} words). Chapter costs only; interview sessions and analysis are extra.`,
        "",
        "**Each production step is one request capped at 300 s; anything near 240 s needs splitting before launch. A and B are a single call and are not timed (they show 0).",
        "",
        "A = today (Sonnet 4.6 one pass) · B = today's prompt on Sonnet 5 · C = Publisher-Ready production mix · D = Publisher-Ready budget mix",
        "",
        "## Per chapter",
        "",
        ...rows.map((r) => `- ${r.fixture} · ${r.arm}: ${r.total}/${RUBRIC_MAX} ${JSON.stringify(r.scores)} · $${r.dollars.toFixed(3)} · worst: ${r.worst}`),
      ];
      const out = path.join(RESULTS, `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-SCOREBOARD.md`);
      fs.writeFileSync(out, lines.join("\n"));
      console.log(lines.slice(0, 12).join("\n"));
      console.log(`Report: ${out}`);
      return;
    }

    throw new Error(`Unknown PR_EVAL_PHASE ${PHASE}`);
  });
});
