import { createServerClient } from "@/lib/supabase";
import { ensureBalance } from "@/lib/ink";
import {
  AIError,
  type Schema,
  type Workload,
  type RoutingSnapshot,
  type TextResult,
} from "@/lib/ai/contracts";
import { readSnapshot } from "@/lib/ai/publisher-ready-routing";
import { databaseAttempts, durableText } from "@/lib/ai/usage/ledger";
import {
  coreDraft,
  coreEdit,
  coreRevise,
  DEFAULT_MIX,
  applyEdits,
  type CoreCall,
  type ChapterInput,
} from "./core";
import { loadChapterContext, StepError } from "./pipeline";
import {
  FINAL_SCHEMA,
  REVISE_SCHEMA,
  finalCheckSystem,
  type Beat,
  type EditorReport,
} from "./prompts";
import {
  contextBlock,
  digest,
  ISSUES_SCHEMA,
  validateEvidence,
  type Issue,
  type SourceLedger,
} from "./source-ledger";
import { auditSelected, needsPremium } from "./review-policy";
import { lintStructure, bookRepeats } from "./structural-lint";

type Db = ReturnType<typeof createServerClient>;
const analysisSchema: Schema = {
  type: "object",
  properties: { findings: ISSUES_SCHEMA },
  required: ["findings"],
  additionalProperties: false,
};
const orderSchema: Schema = {
  type: "object",
  properties: {
    source_ids: { type: "array", items: { type: "string" } },
    uncertainties: { type: "array", items: { type: "string" } },
  },
  required: ["source_ids", "uncertainties"],
  additionalProperties: false,
};
const findingSchema: Schema = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          location: { type: "string" },
          problem: { type: "string" },
        },
        required: ["location", "problem"],
        additionalProperties: false,
      },
    },
  },
  required: ["findings"],
  additionalProperties: false,
};
const WORK: Record<string, Workload> = {
  beats: "beats",
  draft: "draft",
  edit: "editor",
  revise: "revision",
  final: "final_check",
  coverage: "coverage",
  interview: "interview",
};

export function mixedExecutor(options: {
  snapshot: RoutingSnapshot;
  ledger: SourceLedger;
  input: ChapterInput;
  manuscript?: string;
  runId: string;
  chapterId: string;
  send: (
    key: string,
    workload: Workload,
    system: string,
    user: string,
    maxTokens: number,
    schema?: Schema,
    onText?: (s: string) => void,
  ) => Promise<TextResult>;
}): CoreCall {
  const { snapshot, ledger, send } = options;
  return async (step, system, user, opts) => {
    const workload = WORK[step];
    const schema = opts.jsonSchema as Schema | undefined;
    let requestSchema: Schema | undefined =
      step === "edit" && schema
        ? {
            ...schema,
            properties: { ...schema.properties, issues: ISSUES_SCHEMA },
            required: [...(schema.required ?? []), "issues"],
          }
        : schema;
    if (step === "revise")
      requestSchema = {
        type: "object",
        properties: {
          edits: FINAL_SCHEMA.properties.edits,
          change_log: REVISE_SCHEMA.properties.change_log,
        },
        required: ["edits", "change_log"],
        additionalProperties: false,
      };
    if (step === "revise")
      system +=
        "\nReturn focused unique find/replace edits, not a replacement chapter. Do not change quotations or unaffected paragraphs. Record the same note/question refs in change_log.";
    const extra =
      step === "edit"
        ? "\nAlso return evidence-linked issues with verbatim source quotes. Uncertain facts remain questions. Never claim that a source quote proves more than it says."
        : "";
    const res = await send(
      step,
      workload,
      system + extra + contextBlock(ledger),
      user,
      opts.maxTokens ?? 16000,
      requestSchema,
      opts.onText,
    );
    if (step === "beats") {
      const parsed = JSON.parse(res.text) as { beats: Beat[] };
      for (const beat of parsed.beats)
        if (
          beat.source_quote &&
          !ledger.evidence.some((e) => e.text.includes(beat.source_quote!))
        )
          throw new AIError("malformed", "Beat quote is not in the source");
    }
    let text = res.text;
    if (step === "revise") {
      if (options.manuscript === undefined)
        throw new AIError(
          "configuration",
          "Revision needs the pinned manuscript",
        );
      const patch = JSON.parse(text) as {
        edits: { find: string; replace: string }[];
        change_log: unknown[];
      };
      const applied = applyEdits(options.manuscript, patch.edits);
      const changes = patch.edits.filter((e) => e.find !== e.replace).length;
      if (applied.rejected || applied.applied !== changes)
        throw new AIError(
          "review_needed",
          "Revision could not be applied uniquely without changing quoted words",
        );
      text = JSON.stringify({
        chapter: applied.text,
        change_log: patch.change_log,
      });
    }
    if (step === "edit") {
      const primary = JSON.parse(res.text) as EditorReport & {
        issues: Issue[];
      };
      validateEvidence(primary.issues, ledger);
      if (
        needsPremium(
          primary.issues,
          auditSelected(
            options.runId,
            options.chapterId,
            snapshot.auditPercent,
          ),
        )
      ) {
        const premium = await send(
          "premium_editor",
          "premium_editor",
          system + extra + contextBlock(ledger),
          user +
            `\nPRIMARY REVIEW (independently verify, preserve disagreements):\n${res.text}`,
          32000,
          requestSchema,
        );
        const reviewed = JSON.parse(premium.text) as EditorReport & {
          issues: Issue[];
        };
        validateEvidence(reviewed.issues, ledger);
        // Both sets of questions/notes survive; a second reviewer cannot silently erase a primary finding.
        const unique = <T>(items: T[]) => [
          ...new Map(items.map((i) => [JSON.stringify(i), i])).values(),
        ];
        primary.author_questions = unique([
          ...primary.author_questions,
          ...reviewed.author_questions,
        ]);
        primary.craft_notes = unique([
          ...primary.craft_notes,
          ...reviewed.craft_notes,
        ]);
        primary.issues = unique([...primary.issues, ...reviewed.issues]);
        primary.summary += `\nPremium review: ${reviewed.summary}`;
      }
      for (const issue of primary.issues.filter(
        (i) =>
          i.uncertainty ||
          i.kind === "factual_conflict" ||
          i.kind === "timeline" ||
          i.kind === "editorial_disagreement",
      )) {
        primary.author_questions.push({
          question: `Can you clarify this point in your account: ${issue.location}?`,
          why: `${issue.action} Source: ${issue.source_quote}`,
          impact: 5,
          beat_id: null,
        });
      }
      text = JSON.stringify(primary);
    }
    // Existing return contract; mixed billing reads the durable ledger, never these compatibility counters.
    return {
      text,
      servedBy: res.model,
      usage: {
        input_tokens: res.usage.inputTokens ?? 0,
        output_tokens: res.usage.outputTokens ?? 0,
        cache_read_input_tokens: res.usage.cachedInputTokens ?? 0,
        cache_creation_input_tokens: res.usage.cacheWriteTokens ?? 0,
      },
    };
  };
}

async function otherTexts(
  db: Db,
  projectId: string,
  chapterId: string,
): Promise<Record<string, string>> {
  const { data: chapters, error } = await db
    .from("chapters")
    .select("id,chapter_number")
    .eq("project_id", projectId)
    .neq("id", chapterId);
  if (error) throw error;
  const entries = await Promise.all(
    (chapters ?? []).map(async (ch) => {
      const { data, error } = await db
        .from("chapter_contents")
        .select("content")
        .eq("chapter_id", ch.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return [`Chapter ${ch.chapter_number}`, data?.content ?? ""];
    }),
  );
  return Object.fromEntries(entries);
}

/** Returns null for historical/current runs. Called only after route authentication. */
export async function mixedStep(opts: {
  userId: string;
  runId: string;
  chapterId: string;
  step: string;
  creativeFreedom?: number;
  onText?: (s: string) => void;
  signal?: AbortSignal;
}): Promise<{ result: unknown } | null> {
  const db = createServerClient();
  const { data: run, error: runError } = await db
    .from("pr_runs")
    .select("*")
    .eq("id", opts.runId)
    .eq("user_id", opts.userId)
    .single();
  if (runError || !run) throw new StepError("Run not found", 404);
  const snapshot = readSnapshot(run.models);
  if (!snapshot) return null;
  if (!["draft", "edit", "revise", "final"].includes(opts.step))
    throw new StepError("Invalid step");
  const ctx = await loadChapterContext(db, opts.userId, opts.chapterId);
  if (ctx.projectId !== run.project_id)
    throw new StepError("Chapter is not in this run", 404);
  const key = `chapter:${opts.chapterId}:${opts.step}`;
  const { data: prior, error: priorError } = await db
    .from("ai_operations")
    .select("state,result")
    .eq("run_id", opts.runId)
    .eq("user_id", opts.userId)
    .eq("operation_key", key)
    .maybeSingle();
  if (priorError) throw priorError;
  if (prior?.state === "complete") return { result: prior.result };
  const ledger = ctx.input.sourceLedger;
  if (!ledger?.evidence.length)
    throw new AIError(
      "review_needed",
      "No traceable source excerpts for this chapter",
    );
  const { data: firstContext, error: contextError } = await db
    .from("ai_operations")
    .select("context")
    .eq("run_id", opts.runId)
    .eq("chapter_id", opts.chapterId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (contextError) throw contextError;
  if (
    firstContext?.context?.source_version &&
    firstContext.context.source_version !== ledger.version
  )
    throw new AIError(
      "review_needed",
      "Raw sources changed after this run was pinned; review source corrections before continuing",
    );
  if (opts.step !== "draft" && !ctx.latest)
    throw new StepError("Draft this chapter first");
  const required =
    opts.step === "edit" ? "draft" : opts.step === "final" ? "revise" : null;
  if (required && required !== "draft") {
    const { data } = await db
      .from("pr_chapter_passes")
      .select("id")
      .eq("run_id", run.id)
      .eq("chapter_id", opts.chapterId)
      .eq("step", required)
      .maybeSingle();
    if (!data) throw new StepError("Finish the preceding step first", 409);
  }
  if (opts.step === "revise") {
    const [{ data: chs, error: ce }, { data: passes, error: pe }] =
      await Promise.all([
        db
          .from("chapters")
          .select("id")
          .eq("project_id", run.project_id)
          .gt("chapter_number", 0),
        db
          .from("pr_chapter_passes")
          .select("chapter_id")
          .eq("run_id", run.id)
          .eq("step", "edit"),
      ]);
    if (ce || pe) throw ce ?? pe;
    if (chs?.some((ch) => !passes?.some((p) => p.chapter_id === ch.id)))
      throw new StepError("Finish editor review first", 409);
  }
  await ensureBalance(opts.userId);
  const { data: operation, error } = await db.rpc("begin_mixed_operation", {
    p_user_id: opts.userId,
    p_run_id: run.id,
    p_chapter_id: opts.chapterId,
    p_key: key,
    p_input_hash: digest([ctx.input, ctx.latest, opts.creativeFreedom ?? 50]),
    p_context: {
      input: ctx.input,
      version: ctx.latest?.version ?? 0,
      source_version: ledger.version,
    },
  });
  if (error || !operation)
    throw new AIError(
      "review_needed",
      "Operation is running, changed, or requires reservation/reconciliation",
    );
  if (operation.state === "complete") return { result: operation.result };
  const store = databaseAttempts(db, operation.id);
  const send = async (
    callKey: string,
    workload: Workload,
    system: string,
    user: string,
    maxTokens: number,
    schema?: Schema,
    onText?: (s: string) => void,
  ) =>
    durableText(
      store,
      callKey,
      snapshot.routes[workload],
      { system, user, maxTokens, schema, onText, signal: opts.signal },
      snapshot.maxOperationUsd,
    );
  const call = mixedExecutor({
    snapshot,
    ledger,
    input: ctx.input,
    manuscript: ctx.latest?.content,
    runId: run.id,
    chapterId: opts.chapterId,
    send,
  });
  try {
    let output: Record<string, unknown>;
    if (opts.step === "draft") {
      const organization = await send(
        "organize",
        "organize",
        "Organize source IDs into a useful chapter sequence. Retain every raw source, invent nothing; list ambiguities." +
          contextBlock(ledger),
        ctx.input.chapterSummary,
        4000,
        orderSchema,
      );
      const order = JSON.parse(organization.text) as { source_ids: string[] };
      const valid = new Set(ledger.evidence.map((e) => e.id));
      if (
        order.source_ids.some((id) => !valid.has(id)) ||
        new Set(order.source_ids).size !== valid.size
      )
        throw new AIError(
          "malformed",
          "Organization dropped or invented source IDs",
        );
      const analysis = await send(
        "analysis",
        "analysis",
        "Analyze chronology, themes and contradictions. Return only evidence-linked findings; do not invent missing facts." +
          contextBlock(ledger),
        ctx.input.chapterSummary,
        8000,
        analysisSchema,
      );
      validateEvidence(JSON.parse(analysis.text).findings, ledger);
      const enriched = {
        ...ctx.input,
        styleMemoryBlock:
          ctx.input.styleMemoryBlock +
          `\nSOURCE ORGANIZATION:\n${organization.text}\nSOURCE ANALYSIS (uncertainties remain unresolved):\n${analysis.text}`,
      };
      const out = await coreDraft(enriched, DEFAULT_MIX, {
        creativeFreedom: opts.creativeFreedom,
        onText: opts.onText,
        call,
      });
      output = {
        text: out.text,
        beats: out.beats,
        result: {
          wordCount: out.text.trim().split(/\s+/).length,
          beats: out.beats.length,
        },
      };
    } else if (opts.step === "edit") {
      const { data: pass, error } = await db
        .from("pr_chapter_passes")
        .select("beat_plan")
        .eq("run_id", run.id)
        .eq("chapter_id", opts.chapterId)
        .eq("step", "draft")
        .maybeSingle();
      if (error) throw error;
      const out = await coreEdit(
        ctx.input,
        ctx.latest!.content,
        pass?.beat_plan ?? [],
        await otherTexts(db, run.project_id, opts.chapterId),
        DEFAULT_MIX,
        call,
      );
      output = {
        report: out.report,
        scores: { ...out.report.scores, summary: out.report.summary },
        result: {
          questions: out.report.author_questions.length,
          craftNotes: out.report.craft_notes.length,
          scores: out.report.scores,
          summary: out.report.summary,
        },
      };
    } else if (opts.step === "revise") {
      const [
        { data: notes, error: ne },
        { data: questions, error: qe },
        { data: answers, error: ae },
      ] = await Promise.all([
        db
          .from("pr_craft_notes")
          .select("id,span,problem,fix")
          .eq("run_id", run.id)
          .eq("chapter_id", opts.chapterId)
          .eq("status", "open")
          .order("id"),
        db
          .from("pr_questions")
          .select("id,question,status")
          .eq("run_id", run.id)
          .eq("chapter_id", opts.chapterId)
          .order("id"),
        db
          .from("pr_answers")
          .select("question_id,transcript")
          .eq("run_id", run.id)
          .order("created_at"),
      ]);
      if (ne || qe || ae) throw ne ?? qe ?? ae;
      const out = await coreRevise(
        ctx.input,
        ctx.latest!.content,
        notes ?? [],
        (questions ?? []).map((q) => ({
          ...q,
          answer:
            q.status === "answered"
              ? (answers ?? [])
                  .filter((a) => a.question_id === q.id)
                  .map((a) => a.transcript)
                  .join("\n")
              : null,
        })),
        DEFAULT_MIX,
        { call },
      );
      // Missing change-log entries stay open; they are never silently marked fixed.
      const resolved = (notes ?? []).flatMap((n) => {
        const entry = out.changeLog.find((e) => e.ref === n.id);
        return entry
          ? [
              {
                id: n.id,
                status: entry.action === "declined" ? "declined" : "fixed",
                reason: entry.what_changed,
              },
            ]
          : [];
      });
      output = {
        text: out.text,
        changeLog: out.changeLog,
        resolved_notes: resolved,
        result: { changes: out.changeLog.length },
      };
    } else {
      output = await mixedFinal(
        ctx.latest!.content,
        await otherTexts(db, run.project_id, opts.chapterId),
        ledger,
        send,
      );
    }
    const { data: result, error } = await db.rpc("finish_mixed_step", {
      p_user_id: opts.userId,
      p_operation_id: operation.id,
      p_step: opts.step,
      p_output: output,
    });
    if (error)
      throw new AIError(
        "review_needed",
        "Commit/settlement needs reconciliation; completed outputs retained",
      );
    return { result };
  } catch (err) {
    const { error } = await db
      .from("ai_operations")
      .update({ state: "review_needed" })
      .eq("id", operation.id)
      .eq("state", "running");
    if (error)
      throw new AIError(
        "reconcile",
        "Operation recovery marker could not be saved",
      );
    throw err;
  }
}

export async function mixedFinal(
  text: string,
  neighbors: Record<string, string>,
  ledger: SourceLedger,
  send: (
    key: string,
    workload: Workload,
    system: string,
    user: string,
    maxTokens: number,
    schema?: Schema,
  ) => Promise<TextResult>,
): Promise<Record<string, unknown>> {
  const findings = await send(
    "final_check",
    "final_check",
    "Check continuity, coverage and line-level problems. Return findings only. Never write replacement manuscript prose." +
      contextBlock(ledger),
    JSON.stringify({
      chapter: text,
      neighbors,
      flags: [...lintStructure(text).flags, ...bookRepeats(text, neighbors)],
    }),
    8000,
    findingSchema,
  );
  const checks = JSON.parse(findings.text) as {
    findings: { location: string; problem: string }[];
  };
  let applied = { text, applied: 0, rejected: 0 };
  if (checks.findings.length) {
    const repair = await send(
      "final_repair",
      "revision",
      finalCheckSystem() + contextBlock(ledger),
      `FINDINGS:\n${findings.text}\nCHAPTER:\n${text}`,
      16000,
      FINAL_SCHEMA,
    );
    const edits = JSON.parse(repair.text).edits as {
      find: string;
      replace: string;
    }[];
    applied = applyEdits(text, edits);
    if (
      applied.rejected ||
      applied.applied !== edits.filter((e) => e.find !== e.replace).length
    )
      throw new AIError(
        "review_needed",
        "Final repair was ambiguous or attempted to change quoted source",
      );
  }
  const lint = lintStructure(applied.text);
  return {
    ...(applied.applied ? { text: applied.text } : {}),
    scores: { flags_left: lint.flags.length, tells_score: lint.tells.score },
    result: {
      applied: applied.applied,
      rejected: applied.rejected,
      tellsScore: lint.tells.score,
      flagsLeft: lint.flags.length,
    },
  };
}
