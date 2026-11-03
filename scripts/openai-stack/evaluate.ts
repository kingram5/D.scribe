/** Paid, bounded, operator-invoked sample. Requires explicitly selected authorized source. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { withEvaluationProvider } from "../../src/lib/ai/execution";
import { validateRunConfig } from "../../src/lib/ai/config";
import {
  coreDraft,
  coreEdit,
  coreRevise,
  coreFinal,
  type ChapterInput,
} from "../../src/lib/publisher-ready/core";
async function main() {
  if (process.env.PR_EVAL_CONFIRM !== "yes")
    throw new Error(
      "This evaluation spends vendor money. Set PR_EVAL_CONFIRM=yes only with authorized fixtures and a budget.",
    );
  const [fixturePath, configPath] = process.argv.slice(2);
  if (!fixturePath || !configPath)
    throw new Error(
      "Usage: npm run eval:openai -- fixture.json pinned-config.json",
    );
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
    id: string;
    input: ChapterInput;
    otherChapters: Record<string, string>;
  };
  const config = validateRunConfig(
    JSON.parse(readFileSync(configPath, "utf8")),
  );
  const budget = Number(process.env.PR_EVAL_MAX_USD);
  if (!Number.isFinite(budget) || budget <= 0 || budget > 25)
    throw new Error("Set PR_EVAL_MAX_USD between 0 and 25.");
  if (fixture.input.targetWords > 1500 || fixture.input.excerpts.length > 15000)
    throw new Error(
      "Use a small excerpt (<=1500 target words, <=15000 source characters).",
    );
  const provider = process.env.PR_EVAL_PROVIDER ?? "openai";
  if (provider !== "openai")
    throw new Error(
      "Use npm run eval:pr for the legacy arm; this bounded runner supports OpenAI only.",
    );
  const path = `evals/publisher-ready/results/openai-${randomUUID()}.json`;
  mkdirSync("evals/publisher-ready/results", { recursive: true });
  let spent = 0;
  const report: {
    fixture: string;
    provider: string;
    config: unknown;
    calls: unknown[];
    outputs: Record<string, unknown>;
    error?: string;
    elapsedMs?: number;
  } = {
    fixture: fixture.id,
    provider,
    config,
    calls: [],
    outputs: {},
  };
  const save = () => writeFileSync(path, JSON.stringify(report, null, 2));
  const t = Date.now();
  const run = async () => {
    const draft = await coreDraft(fixture.input);
    report.outputs.draft = draft;
    save();
    const edit = await coreEdit(
      fixture.input,
      draft.text,
      draft.beats,
      fixture.otherChapters,
    );
    report.outputs.editor = edit;
    save();
    // Deliberately unanswered: source fidelity must survive missing author material.
    const revised = await coreRevise(
      fixture.input,
      draft.text,
      edit.report.craft_notes.map((n, i) => ({ ...n, id: `N${i + 1}` })),
      edit.report.author_questions.map((q, i) => ({
        id: `Q${i + 1}`,
        question: q.question,
        answer: null,
      })),
    );
    report.outputs.revision = revised;
    save();
    const final = await coreFinal(revised.text, fixture.otherChapters);
    report.outputs.final = final;
    save();
  };
  try {
    await withEvaluationProvider(
      config,
      (max) => {
        if (spent + max > budget)
          throw new Error(
            "Evaluation budget would be exceeded by the next call.",
          );
      },
      async (stage, out) => {
        if (out.cost === null)
          throw new Error(
            "Unknown evaluation usage; reconcile before repeating.",
          );
        spent += out.cost;
        report.calls.push({
          stage,
          responseId: out.response.id,
          requestId: out.requestId,
          model: out.response.model,
          usage: out.response.usage,
          usd: out.cost,
          error: out.error,
        });
        save();
      },
      run,
    );
  } catch (e) {
    report.error = e instanceof Error ? e.message : "Evaluation interrupted";
    process.exitCode = 1;
  } finally {
    report.elapsedMs = Date.now() - t;
    save();
    console.log(
      `Evaluation results saved to ${path}; vendor USD observed: ${spent.toFixed(6)}. No customer wallet was used.`,
    );
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
