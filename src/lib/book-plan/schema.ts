import { z } from "zod";
import { AUDIENCES } from "@/lib/audience-profiles";

/**
 * Versioned book-plan contract shared by the ChatGPT app (MCP tools) and any
 * website route that adopts the planning service. Bump PLAN_SCHEMA_VERSION on a
 * breaking change and keep the reader tolerant of the previous version.
 */
export const PLAN_SCHEMA_VERSION = 1;

/** Hard limits. Kept in one place so docs, tools and tests agree. */
export const PLAN_LIMITS = {
  /** Characters of source text accepted per preview (~20k words). */
  maxSourceChars: 120_000,
  /** Characters accepted for an existing outline or draft being imported. */
  maxImportChars: 120_000,
  maxChapters: 40,
  minChapters: 1,
  maxTitleChars: 200,
  maxSummaryChars: 1_200,
  maxGaps: 20,
  maxQuestions: 10,
  /** A source quote cited by a chapter is capped so the plan stays a plan. */
  maxQuoteChars: 400,
  maxSourceRefsPerChapter: 12,
  /** Preview lifetime. Long enough to sign up and confirm an email. */
  previewTtlHours: 48,
} as const;

export const INPUT_MODES = ["idea", "source", "import"] as const;
export type InputMode = (typeof INPUT_MODES)[number];

/**
 * Where a piece of the plan came from. `imported` text is the user's own words
 * and must be saved untouched; `generated` is a suggestion; `provisional`
 * marks idea-only structure that is not backed by any supplied material.
 */
export const PROVENANCE = ["imported", "generated", "provisional"] as const;
export type Provenance = (typeof PROVENANCE)[number];

export const audienceSchema = z.enum(AUDIENCES);

export const sourceRefSchema = z.object({
  /** Stable id of a normalized source segment, e.g. "s12". */
  segment_id: z.string().regex(/^s\d{1,5}$/),
  /** Optional verbatim excerpt from that segment. Verified server side. */
  quote: z.string().max(PLAN_LIMITS.maxQuoteChars).optional(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

export const planChapterSchema = z.object({
  id: z.string().regex(/^c\d{1,3}$/),
  order: z.number().int().min(1),
  title: z.string().trim().min(1).max(PLAN_LIMITS.maxTitleChars),
  summary: z.string().trim().max(PLAN_LIMITS.maxSummaryChars),
  provenance: z.enum(PROVENANCE),
  source_refs: z.array(sourceRefSchema).max(PLAN_LIMITS.maxSourceRefsPerChapter),
  /**
   * Imports only: the author's own text under this heading, verbatim. Saved as
   * the chapter summary (import_kind "outline") or as the chapter's first
   * content version (import_kind "draft"). Never rewritten.
   */
  body: z.string().max(PLAN_LIMITS.maxImportChars).optional(),
});
export type PlanChapter = z.infer<typeof planChapterSchema>;

export const bookPlanSchema = z.object({
  schema_version: z.literal(PLAN_SCHEMA_VERSION),
  input_mode: z.enum(INPUT_MODES),
  /** Imports only: whether chapter bodies are outline notes or draft prose. */
  import_kind: z.enum(["outline", "draft"]).optional(),
  title: z.string().trim().min(1).max(PLAN_LIMITS.maxTitleChars),
  title_provenance: z.enum(PROVENANCE),
  audience: audienceSchema,
  intended_reader: z.string().trim().max(PLAN_LIMITS.maxSummaryChars),
  promise: z.string().trim().max(PLAN_LIMITS.maxSummaryChars),
  chapters: z.array(planChapterSchema).min(PLAN_LIMITS.minChapters).max(PLAN_LIMITS.maxChapters),
  gaps: z.array(z.string().trim().min(1).max(PLAN_LIMITS.maxSummaryChars)).max(PLAN_LIMITS.maxGaps),
  follow_up_questions: z
    .array(z.string().trim().min(1).max(PLAN_LIMITS.maxSummaryChars))
    .max(PLAN_LIMITS.maxQuestions),
});
export type BookPlan = z.infer<typeof bookPlanSchema>;

/**
 * Shape a caller (ChatGPT's own model, or our generator) proposes. Looser than
 * BookPlan: ids, order, provenance and schema_version are assigned server side
 * so a client cannot claim generated text is "imported".
 */
export const proposedPlanSchema = z.object({
  title: z.string().trim().min(1).max(PLAN_LIMITS.maxTitleChars),
  audience: z.string().trim().max(80).optional(),
  intended_reader: z.string().trim().max(PLAN_LIMITS.maxSummaryChars).default(""),
  promise: z.string().trim().max(PLAN_LIMITS.maxSummaryChars).default(""),
  chapters: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(PLAN_LIMITS.maxTitleChars),
        summary: z.string().trim().max(PLAN_LIMITS.maxSummaryChars).default(""),
        source_refs: z.array(sourceRefSchema).max(PLAN_LIMITS.maxSourceRefsPerChapter).default([]),
      })
    )
    .min(PLAN_LIMITS.minChapters)
    .max(PLAN_LIMITS.maxChapters),
  gaps: z.array(z.string().trim().min(1).max(PLAN_LIMITS.maxSummaryChars)).max(PLAN_LIMITS.maxGaps).default([]),
  follow_up_questions: z
    .array(z.string().trim().min(1).max(PLAN_LIMITS.maxSummaryChars))
    .max(PLAN_LIMITS.maxQuestions)
    .default([]),
});
export type ProposedPlan = z.infer<typeof proposedPlanSchema>;

/** Map a free-text audience onto the closed set the projects table accepts. */
export function coerceAudience(value: string | undefined | null): z.infer<typeof audienceSchema> {
  if (!value) return "General";
  const v = value.trim().toLowerCase();
  const exact = AUDIENCES.find((a) => a.toLowerCase() === v);
  if (exact) return exact;
  if (/(church|sermon|pastor|faith|ministry|christian|bible)/.test(v)) return "Christian Living";
  if (/(leader|executive|manager)/.test(v)) return "Leadership";
  if (/(business|entrepreneur|sales|marketing|startup)/.test(v)) return "Business & Economics";
  if (/(coach|self.?help|growth|mindset)/.test(v)) return "Personal Development";
  if (/(memoir|life story|biography)/.test(v)) return "Memoir & Biography";
  if (/(health|wellness|fitness)/.test(v)) return "Health & Wellness";
  if (/(parent)/.test(v)) return "Parenting";
  if (/(money|finance|invest)/.test(v)) return "Money & Finance";
  if (/(academic|scholar|research)/.test(v)) return "Academic";
  return "General";
}
