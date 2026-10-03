import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { buildPlanFromImport, buildPlanFromProposal, InvalidPlanError, planToText, type BuildWarning } from "@/lib/book-plan/build";
import { generatePlan, PlanGenerationError, type GenerateInput } from "@/lib/book-plan/generate";
import { ImportTooLargeError, parseOutline } from "@/lib/book-plan/import";
import { normalizeSource, SourceTooLargeError, type NormalizedSource, type SourceSegment } from "@/lib/book-plan/normalize";
import { PlanStore, PlanStoreError } from "@/lib/book-plan/persist";
import { PLAN_LIMITS, type BookPlan } from "@/lib/book-plan/schema";
import type { ClaudeUsage } from "@/lib/claude-lite";
import { chatgptFlags, protectedResourceMetadataUrl, siteUrl } from "./config";
import { track } from "./events";

/**
 * MCP tool handlers for the D.scribe ChatGPT app. Transport-free and
 * dependency-injected so every path is unit-testable; src/app/mcp/route.ts
 * wires them to the MCP SDK.
 *
 * Security model:
 *   - `identity` is null (anonymous) or comes from a verified OAuth token.
 *   - No tool accepts a user id. Ownership is enforced on every read/write.
 *   - Saves read the plan from the server-side preview, never from tool args,
 *     so nothing can be saved that was not previewed and validated.
 */

export type ErrorCode =
  | "auth_required"
  | "access_denied"
  | "not_found"
  | "preview_expired"
  | "already_saved"
  | "insufficient_ink"
  | "invalid_input"
  | "rate_limited"
  | "generation_unavailable"
  | "plan_required"
  | "feature_disabled"
  | "conflict"
  | "internal";

export interface Identity {
  userId: string;
  email: string | null;
}

export interface InkPort {
  reserve(userId: string): Promise<{ allowed: boolean; reason?: string; reservationId?: string }>;
  settle(reservationId: string, usage: ClaudeUsage): Promise<void>;
  release(reservationId: string): Promise<void>;
}

export interface ToolDeps {
  identity: Identity | null;
  store: PlanStore;
  db: SupabaseClient;
  ink: InkPort;
  generate?: typeof generatePlan;
  rateLimit: (key: string, limit: number) => Promise<boolean>;
  /** Anonymous rate-limit bucket, e.g. derived from the client IP. */
  anonKey: string;
}

export const WIDGET_URI = "ui://dscribe/book-plan-v1.html";

// ------------------------------------------------------------------ helpers

export function errorResult(code: ErrorCode, message: string, extra: Record<string, unknown> = {}): CallToolResult {
  const result: CallToolResult = {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: { code, message, ...extra } },
  };
  if (code === "auth_required") {
    result._meta = {
      "mcp/www_authenticate": [
        `Bearer resource_metadata="${protectedResourceMetadataUrl()}", error="invalid_token", error_description="Connect your D.scribe account to continue"`,
      ],
    };
  }
  return result;
}

function projectUrl(projectId: string): string {
  return `${siteUrl()}/project/${projectId}`;
}

function previewPayload(
  plan: BookPlan,
  preview: { id: string; claimToken: string; expiresAt: string },
  warnings: BuildWarning[],
  segments: SourceSegment[],
  linked: boolean
): CallToolResult {
  const saveHint = linked
    ? "To keep it, call save_book_plan with this preview_id and claim_token."
    : "To keep it, the user connects their D.scribe account and then save_book_plan is called with this preview_id and claim_token.";
  return {
    content: [
      {
        type: "text",
        text: `${planToText(plan)}\n\nThis is a preview; nothing has been saved to D.scribe yet. ${saveHint} The preview expires ${preview.expiresAt}.`,
      },
    ],
    structuredContent: {
      preview_id: preview.id,
      claim_token: preview.claimToken,
      expires_at: preview.expiresAt,
      saved: false,
      plan,
      warnings: warnings.map((w) => ({ code: w.code, message: w.message, chapter_id: w.chapter_id })),
      source_segment_count: segments.length,
    },
    _meta: {
      // Segment text is for the widget's "sources" panel; it is the user's own
      // material and not needed by the model, so it stays out of structuredContent.
      segments: segments.slice(0, 400),
      linked,
    },
  };
}

// ------------------------------------------------------------ preview_book_plan

const proposedChapter = z.object({
  title: z.string().max(PLAN_LIMITS.maxTitleChars),
  summary: z.string().max(PLAN_LIMITS.maxSummaryChars).optional(),
  source_refs: z
    .array(z.object({ segment_id: z.string().max(8), quote: z.string().max(PLAN_LIMITS.maxQuoteChars).optional() }))
    .max(PLAN_LIMITS.maxSourceRefsPerChapter)
    .optional(),
});

export const previewInput = {
  mode: z
    .enum(["idea", "source", "import"])
    .describe("idea = no material yet; source = transcript/notes the user pasted; import = an outline or draft the user already wrote"),
  source_text: z
    .string()
    .max(PLAN_LIMITS.maxSourceChars)
    .optional()
    .describe("mode=source: the transcript or notes the user explicitly shared, verbatim"),
  import_text: z
    .string()
    .max(PLAN_LIMITS.maxImportChars)
    .optional()
    .describe("mode=import: the user's existing outline or draft, verbatim. It is saved without rewording."),
  import_kind: z.enum(["outline", "draft"]).optional().describe("mode=import: outline notes or draft prose. Default outline."),
  idea: z
    .object({
      reader: z.string().max(500).optional(),
      message: z.string().max(1000).optional(),
      material: z.string().max(1000).optional(),
      outcome: z.string().max(500).optional(),
    })
    .optional()
    .describe("mode=idea: intended reader, main message, material they have, desired outcome"),
  proposed_plan: z
    .object({
      title: z.string().max(PLAN_LIMITS.maxTitleChars),
      audience: z.string().max(80).optional(),
      intended_reader: z.string().max(PLAN_LIMITS.maxSummaryChars).optional(),
      promise: z.string().max(PLAN_LIMITS.maxSummaryChars).optional(),
      chapters: z.array(proposedChapter).min(1).max(PLAN_LIMITS.maxChapters),
      gaps: z.array(z.string().max(PLAN_LIMITS.maxSummaryChars)).max(PLAN_LIMITS.maxGaps).optional(),
      follow_up_questions: z.array(z.string().max(PLAN_LIMITS.maxSummaryChars)).max(PLAN_LIMITS.maxQuestions).optional(),
    })
    .optional()
    .describe(
      "modes idea/source: a plan you drafted. Cite source material by segment id (s1, s2...) from a previous preview of the same source. Quotes must be verbatim; unverifiable ones are removed."
    ),
  based_on: z
    .object({ preview_id: z.string().uuid(), claim_token: z.string().min(16).max(100) })
    .optional()
    .describe("Refine an earlier preview: its stored source is reused, so do not resend the text."),
  title: z.string().max(PLAN_LIMITS.maxTitleChars).optional(),
  audience: z.string().max(80).optional(),
  num_chapters: z.number().int().min(3).max(PLAN_LIMITS.maxChapters).optional(),
  use_dscribe_model: z
    .boolean()
    .optional()
    .describe("Ask D.scribe's own model to build or revise the plan. Needs a connected account and uses Ink from the user's balance."),
  refine_instruction: z.string().max(2000).optional().describe("With based_on + use_dscribe_model: the change the user asked for."),
};
const previewInputSchema = z.object(previewInput);
export type PreviewInput = z.infer<typeof previewInputSchema>;

export async function previewBookPlan(raw: PreviewInput, deps: ToolDeps): Promise<CallToolResult> {
  const linked = Boolean(deps.identity);
  if (!linked && !chatgptFlags.anonPreview()) {
    return errorResult("auth_required", "Connect your D.scribe account to build a book plan.");
  }
  const bucket = deps.identity ? `chatgpt-preview:${deps.identity.userId}` : `chatgpt-preview-anon:${deps.anonKey}`;
  if (!(await deps.rateLimit(bucket, linked ? 20 : 5))) {
    return errorResult("rate_limited", "Too many plan previews in a short time. Try again in a minute.");
  }

  const input = previewInputSchema.safeParse(raw);
  if (!input.success) return errorResult("invalid_input", input.error.issues.map((i) => i.message).join("; "));
  const args = input.data;
  track("preview_requested", { mode: args.mode, linked, dscribe_model: Boolean(args.use_dscribe_model) });

  try {
    // ---- Reuse a prior preview's source when refining.
    let source: NormalizedSource | null = null;
    let previousPlan: BookPlan | null = null;
    if (args.based_on) {
      const prev = await deps.store.getPreview(args.based_on.preview_id, args.based_on.claim_token, deps.identity?.userId ?? null);
      previousPlan = prev.plan;
      source = { segments: prev.segments, digest: "", charCount: 0, wordCount: 0, truncated: false };
    } else if (args.mode === "source") {
      if (!args.source_text?.trim()) return errorResult("invalid_input", "mode=source needs source_text: the material the user shared.");
      source = normalizeSource(args.source_text);
    }

    // ---- Faithful import: deterministic, no model, never reworded.
    if (args.mode === "import") {
      const text = args.import_text?.trim();
      if (!text) return errorResult("invalid_input", "mode=import needs import_text: the user's outline or draft, verbatim.");
      const imported = parseOutline(text);
      const built = buildPlanFromImport(imported, {
        title: args.title,
        audience: args.audience,
        importKind: args.import_kind ?? "outline",
      });
      const stored = await deps.store.createPreview({
        plan: built.plan,
        segments: [],
        sourceDigest: null,
        ownerUserId: deps.identity?.userId ?? null,
        generatedBy: "import",
      });
      track("preview_completed", { mode: "import", linked, chapters: built.plan.chapters.length });
      return previewPayload(built.plan, stored, built.warnings, [], linked);
    }

    // ---- Plan drafted by ChatGPT's model: validate + source-map. No spend.
    if (args.proposed_plan && !args.use_dscribe_model) {
      const built = buildPlanFromProposal(
        { ...args.proposed_plan, title: args.title ?? args.proposed_plan.title, audience: args.audience ?? args.proposed_plan.audience },
        args.mode,
        source
      );
      const stored = await deps.store.createPreview({
        plan: built.plan,
        segments: source?.segments ?? [],
        sourceDigest: source?.digest || null,
        ownerUserId: deps.identity?.userId ?? null,
        generatedBy: "client",
      });
      track("preview_completed", { mode: args.mode, linked, chapters: built.plan.chapters.length, warnings: built.warnings.length });
      return previewPayload(built.plan, stored, built.warnings, source?.segments ?? [], linked);
    }

    // ---- D.scribe's own model: linked accounts only, billed in Ink.
    if (!args.use_dscribe_model) {
      // First pass on new source material: segment it so the model can cite ids.
      if (args.mode === "source" && source) {
        return {
          content: [
            {
              type: "text",
              text:
                "The material is segmented below. Draft a book plan from it and call preview_book_plan again with mode=source, " +
                "proposed_plan (cite segments by id, quote only verbatim words), and based_on omitted but source_text resent unchanged. " +
                "Or set use_dscribe_model=true to have D.scribe build it (requires a connected account; uses Ink).\n\n" +
                source.segments.map((s) => `[${s.id}] ${s.text}`).join("\n\n").slice(0, 60_000),
            },
          ],
          structuredContent: { error: { code: "plan_required", message: "Draft proposed_plan from the segments, or set use_dscribe_model." }, segments: source.segments.map((s) => s.id) },
          isError: false,
        };
      }
      return errorResult("plan_required", "Draft a proposed_plan (title, chapters, gaps) and call again, or set use_dscribe_model=true.");
    }
    if (!deps.identity) return errorResult("auth_required", "Connect your D.scribe account to have D.scribe build the plan.");
    if (!chatgptFlags.paidGeneration()) {
      return errorResult("feature_disabled", "D.scribe's own plan generation is not enabled yet. Draft the plan here instead.");
    }
    return await generateWithInk(args, source, previousPlan, deps, deps.identity);
  } catch (err) {
    return mapThrown(err, "preview_failed", { mode: args.mode, linked });
  }
}

async function generateWithInk(
  args: PreviewInput,
  source: NormalizedSource | null,
  previousPlan: BookPlan | null,
  deps: ToolDeps,
  identity: Identity
): Promise<CallToolResult> {
  const hold = await deps.ink.reserve(identity.userId);
  if (!hold.allowed || !hold.reservationId) {
    return errorResult(
      "insufficient_ink",
      `${hold.reason ?? "Not enough Ink for this."} Nothing was charged. You can draft the plan here for free, or check your balance in D.scribe.`,
      { balance_url: `${siteUrl()}/settings` }
    );
  }
  const reservationId = hold.reservationId;
  const gen = deps.generate ?? generatePlan;
  const genInput: GenerateInput = {
    mode: args.mode === "idea" ? "idea" : "source",
    source,
    idea: args.idea,
    audience: args.audience,
    numChapters: args.num_chapters,
    refine: previousPlan && args.refine_instruction ? { previous: previousPlan, instruction: args.refine_instruction } : undefined,
  };
  let result;
  try {
    result = await gen(genInput);
  } catch (err) {
    // Settle what the vendor actually consumed (possibly zero) exactly once.
    const usage = err instanceof PlanGenerationError ? err.usage : { input_tokens: 0, output_tokens: 0 };
    if (usage.input_tokens + usage.output_tokens > 0) await deps.ink.settle(reservationId, usage).catch(() => deps.ink.release(reservationId));
    else await deps.ink.release(reservationId).catch(() => {});
    track("preview_failed", { mode: args.mode, linked: true, reason: "generation" });
    return errorResult("generation_unavailable", "D.scribe could not build the plan this time. You were only charged for work the model actually did. Try again, or draft the plan here.", {
      retryable: true,
    });
  }
  // Store first, then bill: a store failure releases the hold below.
  let stored;
  try {
    stored = await deps.store.createPreview({
      plan: result.plan,
      segments: source?.segments ?? [],
      sourceDigest: source?.digest || null,
      ownerUserId: identity.userId,
      generatedBy: "server",
    });
  } catch (err) {
    await deps.ink.settle(reservationId, result.usage).catch(() => {});
    throw err;
  }
  await deps.ink.settle(reservationId, result.usage);
  track("preview_completed", { mode: args.mode, linked: true, chapters: result.plan.chapters.length, dscribe_model: true });
  return previewPayload(result.plan, stored, result.warnings, source?.segments ?? [], true);
}

// -------------------------------------------------------------- save_book_plan

export const saveInput = {
  preview_id: z.string().uuid(),
  claim_token: z.string().min(16).max(100),
  idempotency_key: z
    .string()
    .min(8)
    .max(200)
    .optional()
    .describe("Optional. Defaults to one key per preview, so a retried save never creates a second project."),
};
const saveInputSchema = z.object(saveInput);

export async function saveBookPlan(raw: z.infer<typeof saveInputSchema>, deps: ToolDeps): Promise<CallToolResult> {
  if (!deps.identity) return errorResult("auth_required", "Connect your D.scribe account to save this plan.");
  if (!chatgptFlags.writes()) return errorResult("feature_disabled", "Saving from ChatGPT is not enabled yet.");
  const input = saveInputSchema.safeParse(raw);
  if (!input.success) return errorResult("invalid_input", input.error.issues.map((i) => i.message).join("; "));
  const { preview_id, claim_token } = input.data;
  if (!(await deps.rateLimit(`chatgpt-save:${deps.identity.userId}`, 10))) {
    return errorResult("rate_limited", "Too many saves in a short time. Try again in a minute.");
  }
  try {
    const preview = await deps.store.getPreview(preview_id, claim_token, deps.identity.userId);
    if (preview.status === "saved" && preview.savedProjectId && preview.ownerUserId === deps.identity.userId) {
      return savedResult(preview.savedProjectId, preview.plan, true);
    }
    const { projectId, replayed } = await deps.store.savePreviewAsNewProject({
      userId: deps.identity.userId,
      previewId: preview_id,
      claimToken: claim_token,
      idempotencyKey: input.data.idempotency_key ?? `preview:${preview_id}`,
      plan: preview.plan,
    });
    track("plan_saved", { mode: preview.plan.input_mode, replayed, chapters: preview.plan.chapters.length });
    return savedResult(projectId, preview.plan, replayed);
  } catch (err) {
    if (err instanceof PlanStoreError && err.code === "preview_already_saved") {
      return errorResult("already_saved", "This plan was already saved to a different account or project.");
    }
    return mapThrown(err, "save_failed", {});
  }
}

function savedResult(projectId: string, plan: BookPlan, replayed: boolean): CallToolResult {
  const url = projectUrl(projectId);
  return {
    content: [
      {
        type: "text",
        text:
          `${replayed ? "Already saved" : "Saved"} to D.scribe as a new project: "${plan.title}" with ${plan.chapters.length} chapters. ` +
          `Open it here: ${url}\nNo existing project was changed. Turning chapters into a manuscript happens in D.scribe and uses Ink from the user's plan.`,
      },
    ],
    structuredContent: { saved: true, project_id: projectId, project_url: url, replayed, plan },
  };
}

// ---------------------------------------------------------------- list_projects

export const listInput = {
  limit: z.number().int().min(1).max(20).optional(),
  cursor: z.string().max(20).optional().describe("Opaque cursor from a previous call"),
};

export async function listProjects(raw: { limit?: number; cursor?: string }, deps: ToolDeps): Promise<CallToolResult> {
  if (!deps.identity) return errorResult("auth_required", "Connect your D.scribe account to see your projects.");
  const limit = raw.limit ?? 10;
  const offset = Math.max(0, Number.parseInt(raw.cursor ?? "0", 10) || 0);
  const { data, error } = await deps.db
    .from("projects")
    .select("id, title, status, audience, updated_at, chapters(count)")
    .eq("user_id", deps.identity.userId)
    .neq("status", "erased")
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit);
  if (error) return errorResult("internal", "Could not load your projects.");
  const rows = (data ?? []) as Array<{ id: string; title: string; status: string; audience: string; updated_at: string; chapters?: Array<{ count: number }> }>;
  const page = rows.slice(0, limit).map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    audience: p.audience,
    chapter_count: p.chapters?.[0]?.count ?? 0,
    updated_at: p.updated_at,
    url: projectUrl(p.id),
  }));
  const nextCursor = rows.length > limit ? String(offset + limit) : null;
  return {
    content: [
      { type: "text", text: page.length ? page.map((p) => `- ${p.title} (${p.chapter_count} chapters, ${p.status})`).join("\n") : "No D.scribe projects yet." },
    ],
    structuredContent: { projects: page, next_cursor: nextCursor },
  };
}

// ---------------------------------------------------------- get_project_summary

export const summaryInput = { project_id: z.string().uuid() };

export async function getProjectSummary(raw: { project_id: string }, deps: ToolDeps): Promise<CallToolResult> {
  if (!deps.identity) return errorResult("auth_required", "Connect your D.scribe account to open a project.");
  const id = z.string().uuid().safeParse(raw.project_id);
  if (!id.success) return errorResult("invalid_input", "project_id must be a project id from list_projects.");
  const { data: project, error } = await deps.db
    .from("projects")
    .select("id, title, audience, status, description, updated_at")
    .eq("id", id.data)
    .eq("user_id", deps.identity.userId)
    .maybeSingle();
  if (error) return errorResult("internal", "Could not load the project.");
  // Same answer for "missing" and "someone else's": no existence oracle.
  if (!project || project.status === "erased") return errorResult("not_found", "No project with that id in your account.");
  const { data: chapters } = await deps.db
    .from("chapters")
    .select("chapter_number, title, summary, status")
    .eq("project_id", id.data)
    .order("chapter_number");
  const list = (chapters ?? []).map((c) => ({
    number: c.chapter_number as number,
    title: c.title as string,
    summary: String(c.summary ?? "").slice(0, 300),
    status: c.status as string,
  }));
  const written = list.filter((c) => c.status === "generated" || c.status === "edited").length;
  return {
    content: [
      {
        type: "text",
        text: `${project.title}: ${list.length} chapters, ${written} written.\n${list.map((c) => `${c.number}. ${c.title} [${c.status}]`).join("\n")}\nOpen: ${projectUrl(project.id)}`,
      },
    ],
    structuredContent: {
      project: { id: project.id, title: project.title, audience: project.audience, status: project.status, updated_at: project.updated_at, url: projectUrl(project.id) },
      chapters: list,
      progress: { chapters: list.length, written },
    },
  };
}

// -------------------------------------------------------------- get_plan_status

export const statusInput = { preview_id: z.string().uuid(), claim_token: z.string().min(16).max(100) };

export async function getPlanStatus(raw: { preview_id: string; claim_token: string }, deps: ToolDeps): Promise<CallToolResult> {
  try {
    const p = await deps.store.getPreview(raw.preview_id, raw.claim_token, deps.identity?.userId ?? null);
    const saved = p.status === "saved" && p.savedProjectId && p.ownerUserId === deps.identity?.userId;
    return {
      content: [{ type: "text", text: saved ? `Saved: ${projectUrl(p.savedProjectId!)}` : `Preview active until ${p.expiresAt}. Not saved yet.` }],
      structuredContent: {
        status: saved ? "saved" : "active",
        expires_at: p.expiresAt,
        project_url: saved ? projectUrl(p.savedProjectId!) : null,
        plan: p.plan,
      },
    };
  } catch (err) {
    return mapThrown(err, "status_failed", {});
  }
}

// ---------------------------------------------------------------- error mapping

function mapThrown(err: unknown, event: "preview_failed" | "save_failed" | "status_failed", props: Record<string, unknown>): CallToolResult {
  if (err instanceof SourceTooLargeError || err instanceof ImportTooLargeError) {
    track(event, { ...props, reason: "too_large" });
    return errorResult("invalid_input", `${err.message} Share a shorter excerpt, or upload the full recording in D.scribe.`);
  }
  if (err instanceof InvalidPlanError) {
    track(event, { ...props, reason: "invalid_plan" });
    return errorResult("invalid_input", err.message);
  }
  if (err instanceof PlanStoreError) {
    track(event, { ...props, reason: err.code });
    switch (err.code) {
      case "preview_not_found":
        return errorResult("not_found", "That plan preview was not found. Build the plan again.");
      case "preview_expired":
        return errorResult("preview_expired", "That plan preview expired (they last 48 hours). Build it again; the saved text is not kept after expiry.");
      case "idempotency_conflict":
        return errorResult("conflict", "That idempotency key was already used for a different save.");
      case "idempotency_in_progress":
        return errorResult("conflict", "That save is still in progress. Check again in a moment.", { retryable: true });
      case "invalid_input":
        return errorResult("invalid_input", err.message);
      default:
        return errorResult("internal", "Something went wrong storing the plan. Nothing in your D.scribe account was changed.", { retryable: true });
    }
  }
  track(event, { ...props, reason: "unexpected" });
  return errorResult("internal", "Something went wrong. Nothing in your D.scribe account was changed.", { retryable: true });
}
