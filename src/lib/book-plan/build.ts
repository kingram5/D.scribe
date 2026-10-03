import type { ImportedOutline } from "./import";
import { quoteKey, type NormalizedSource } from "./normalize";
import {
  bookPlanSchema,
  coerceAudience,
  PLAN_LIMITS,
  PLAN_SCHEMA_VERSION,
  proposedPlanSchema,
  type BookPlan,
  type InputMode,
  type PlanChapter,
  type SourceRef,
} from "./schema";

/**
 * Turns a proposed plan (from ChatGPT's model or from our own generator) into a
 * validated BookPlan. The server, not the proposer, decides:
 *   - chapter ids and order,
 *   - provenance (a proposal can never label its own text "imported"),
 *   - which source references are real (unknown segment ids and quotes that do
 *     not appear verbatim in the supplied material are removed and reported).
 */

export interface BuildWarning {
  code: "unknown_segment" | "unverified_quote" | "uncited_chapter" | "audience_coerced" | "chapters_truncated";
  message: string;
  chapter_id?: string;
}

export interface BuildResult {
  plan: BookPlan;
  warnings: BuildWarning[];
}

export class InvalidPlanError extends Error {
  constructor(public readonly issues: string[]) {
    super(`The proposed plan is invalid: ${issues.slice(0, 5).join("; ")}`);
    this.name = "InvalidPlanError";
  }
}

function verifyRefs(
  refs: SourceRef[],
  source: NormalizedSource | null,
  chapterId: string,
  warnings: BuildWarning[]
): SourceRef[] {
  if (!source || source.segments.length === 0) {
    if (refs.length) {
      warnings.push({
        code: "unknown_segment",
        chapter_id: chapterId,
        message: `Removed ${refs.length} source reference(s): no source material was supplied.`,
      });
    }
    return [];
  }
  const byId = new Map(source.segments.map((s) => [s.id, quoteKey(s.text)]));
  const out: SourceRef[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const segKey = byId.get(ref.segment_id);
    if (segKey === undefined) {
      warnings.push({ code: "unknown_segment", chapter_id: chapterId, message: `Removed reference to ${ref.segment_id}: no such segment.` });
      continue;
    }
    let quote = ref.quote?.trim() || undefined;
    if (quote && !segKey.includes(quoteKey(quote))) {
      warnings.push({
        code: "unverified_quote",
        chapter_id: chapterId,
        message: `Dropped a quote attributed to ${ref.segment_id}: it does not appear verbatim in that segment.`,
      });
      quote = undefined;
    }
    const dedupe = `${ref.segment_id}|${quote ?? ""}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(quote ? { segment_id: ref.segment_id, quote } : { segment_id: ref.segment_id });
  }
  return out;
}

const IDEA_COLLECTION_GAPS = [
  "No source material yet: every chapter here is a provisional placeholder, not something you said.",
  "Record or paste a talk, sermon, or workshop that covers the opening chapters so the plan can cite your real words.",
  "Collect two or three personal stories or client examples you tell often; they become chapter anchors.",
];

export function buildPlanFromProposal(
  rawProposal: unknown,
  mode: Exclude<InputMode, "import">,
  source: NormalizedSource | null
): BuildResult {
  const parsed = proposedPlanSchema.safeParse(rawProposal);
  if (!parsed.success) {
    throw new InvalidPlanError(parsed.error.issues.map((i) => `${i.path.join(".") || "plan"}: ${i.message}`));
  }
  const proposal = parsed.data;
  const warnings: BuildWarning[] = [];

  const audience = coerceAudience(proposal.audience);
  if (proposal.audience && audience.toLowerCase() !== proposal.audience.trim().toLowerCase()) {
    warnings.push({ code: "audience_coerced", message: `Audience "${proposal.audience}" saved as "${audience}".` });
  }

  const provenance = mode === "idea" ? "provisional" : "generated";
  const effectiveSource = mode === "idea" ? null : source;

  const chapters: PlanChapter[] = proposal.chapters.map((c, i) => {
    const id = `c${i + 1}`;
    const refs = verifyRefs(c.source_refs, effectiveSource, id, warnings);
    if (mode === "source" && refs.length === 0) {
      warnings.push({ code: "uncited_chapter", chapter_id: id, message: `"${c.title}" cites no supplied material.` });
    }
    return { id, order: i + 1, title: c.title, summary: c.summary, provenance, source_refs: refs };
  });

  const gaps = [...proposal.gaps];
  if (mode === "idea" && gaps.length === 0) gaps.push(...IDEA_COLLECTION_GAPS);
  if (mode === "source") {
    for (const ch of chapters) {
      if (ch.source_refs.length === 0 && gaps.length < PLAN_LIMITS.maxGaps) {
        gaps.push(`Chapter ${ch.order} ("${ch.title}") has no supporting material in what you shared yet.`);
      }
    }
  }

  const plan: BookPlan = {
    schema_version: PLAN_SCHEMA_VERSION,
    input_mode: mode,
    title: proposal.title,
    title_provenance: provenance,
    audience,
    intended_reader: proposal.intended_reader,
    promise: proposal.promise,
    chapters,
    gaps: gaps.slice(0, PLAN_LIMITS.maxGaps),
    follow_up_questions: proposal.follow_up_questions,
  };
  return { plan: bookPlanSchema.parse(plan), warnings };
}

export function buildPlanFromImport(
  imported: ImportedOutline,
  opts: { title?: string; audience?: string; importKind: "outline" | "draft"; intendedReader?: string; promise?: string }
): BuildResult {
  const warnings: BuildWarning[] = [];
  if (imported.chapters.length === 0) throw new InvalidPlanError(["the import contained no text"]);
  const audience = coerceAudience(opts.audience);
  if (opts.audience && audience.toLowerCase() !== opts.audience.trim().toLowerCase()) {
    warnings.push({ code: "audience_coerced", message: `Audience "${opts.audience}" saved as "${audience}".` });
  }
  const userTitle = opts.title?.trim() || imported.title?.trim() || null;
  const plan: BookPlan = {
    schema_version: PLAN_SCHEMA_VERSION,
    input_mode: "import",
    import_kind: opts.importKind,
    title: (userTitle ?? "Untitled book").slice(0, PLAN_LIMITS.maxTitleChars),
    // A placeholder title is ours, not the author's.
    title_provenance: userTitle ? "imported" : "generated",
    audience,
    intended_reader: opts.intendedReader?.trim() ?? "",
    promise: opts.promise?.trim() ?? "",
    chapters: imported.chapters.map((c, i) => ({
      id: `c${i + 1}`,
      order: i + 1,
      title: c.title.slice(0, PLAN_LIMITS.maxTitleChars),
      // The summary shown in the plan view is a short preview; the full,
      // untouched text rides in `body` and is what gets saved.
      summary: c.body.slice(0, PLAN_LIMITS.maxSummaryChars),
      provenance: "imported" as const,
      source_refs: [],
      body: c.body,
    })),
    gaps: [],
    follow_up_questions: [],
  };
  return { plan: bookPlanSchema.parse(plan), warnings };
}

/** Plain-text rendering used as the tool's text content and the no-UI fallback. */
export function planToText(plan: BookPlan): string {
  const label =
    plan.input_mode === "idea"
      ? "PROVISIONAL plan (no source material yet; nothing below is quoted from you)"
      : plan.input_mode === "import"
        ? "Imported as written (no rewording)"
        : "Plan built from the material you shared";
  const lines = [`${plan.title}`, label, ""];
  if (plan.intended_reader) lines.push(`Reader: ${plan.intended_reader}`);
  if (plan.promise) lines.push(`Promise: ${plan.promise}`);
  lines.push(`Audience category: ${plan.audience}`, "");
  for (const ch of plan.chapters) {
    const refs = ch.source_refs.length ? ` [sources: ${ch.source_refs.map((r) => r.segment_id).join(", ")}]` : "";
    lines.push(`${ch.order}. ${ch.title}${refs}`);
    if (ch.summary) lines.push(`   ${ch.summary.replace(/\n+/g, " ").slice(0, 300)}`);
  }
  if (plan.gaps.length) {
    lines.push("", "Gaps to fill:");
    for (const g of plan.gaps) lines.push(`- ${g}`);
  }
  if (plan.follow_up_questions.length) {
    lines.push("", "Questions:");
    for (const q of plan.follow_up_questions) lines.push(`- ${q}`);
  }
  return lines.join("\n");
}
