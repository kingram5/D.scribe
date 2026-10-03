import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import type { SourceSegment } from "./normalize";
import { bookPlanSchema, PLAN_LIMITS, type BookPlan } from "./schema";

/**
 * Persistence for the planning service. Previews and saves are separate
 * operations: a preview never touches the projects/chapters tables, and a save
 * always creates a NEW project through one database transaction
 * (save_book_plan, migration 032).
 */

export type PlanErrorCode =
  | "preview_not_found"
  | "preview_expired"
  | "preview_already_saved"
  | "idempotency_conflict"
  | "idempotency_in_progress"
  | "invalid_input"
  | "project_not_found"
  | "storage_error";

export class PlanStoreError extends Error {
  constructor(public readonly code: PlanErrorCode, message: string, public readonly projectId?: string) {
    super(message);
    this.name = "PlanStoreError";
  }
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Stable JSON (sorted keys) so the same logical payload always hashes the same. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export interface StoredPreview {
  id: string;
  plan: BookPlan;
  segments: SourceSegment[];
  ownerUserId: string | null;
  status: "active" | "saved";
  savedProjectId: string | null;
  expiresAt: string;
}

/** Translate a Postgres `raise exception` from migration 032 into a typed error. */
export function mapRpcError(message: string): PlanStoreError {
  if (message.includes("preview_already_saved")) {
    const id = message.split("preview_already_saved:")[1]?.trim().split(/\s/)[0] || undefined;
    return new PlanStoreError("preview_already_saved", "This plan was already saved.", id);
  }
  const known: PlanErrorCode[] = [
    "preview_not_found",
    "preview_expired",
    "idempotency_conflict",
    "idempotency_in_progress",
    "project_not_found",
  ];
  for (const code of known) if (message.includes(code)) return new PlanStoreError(code, code.replace(/_/g, " "));
  if (message.includes("invalid_chapters") || message.includes("invalid_idempotency_key")) {
    return new PlanStoreError("invalid_input", message);
  }
  return new PlanStoreError("storage_error", "The plan could not be stored. Nothing was changed.");
}

export class PlanStore {
  constructor(private readonly db: SupabaseClient = createServerClient()) {}

  /** Create a preview. Returns the claim token ONCE; only its hash is stored. */
  async createPreview(args: {
    plan: BookPlan;
    segments: SourceSegment[];
    sourceDigest: string | null;
    ownerUserId: string | null;
    generatedBy: "client" | "server" | "import";
  }): Promise<{ id: string; claimToken: string; expiresAt: string }> {
    const plan = bookPlanSchema.parse(args.plan);
    const claimToken = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + PLAN_LIMITS.previewTtlHours * 3600_000).toISOString();
    const { data, error } = await this.db
      .from("book_plan_previews")
      .insert({
        owner_user_id: args.ownerUserId,
        claim_token_hash: sha256(claimToken),
        input_mode: plan.input_mode,
        schema_version: plan.schema_version,
        plan,
        source_segments: args.segments,
        source_digest: args.sourceDigest,
        generated_by: args.generatedBy,
        expires_at: expiresAt,
      })
      .select("id, expires_at")
      .single();
    if (error || !data) throw new PlanStoreError("storage_error", "Could not store the preview.");
    return { id: data.id as string, claimToken, expiresAt: data.expires_at as string };
  }

  /**
   * Load a preview for refine/display. Requires the claim token. A preview
   * owned by another account reads as not found (no existence oracle).
   */
  async getPreview(id: string, claimToken: string, callerUserId: string | null): Promise<StoredPreview> {
    const { data, error } = await this.db
      .from("book_plan_previews")
      .select("id, plan, source_segments, owner_user_id, status, saved_project_id, expires_at, claim_token_hash")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new PlanStoreError("storage_error", "Could not read the preview.");
    if (!data || data.claim_token_hash !== sha256(claimToken)) {
      throw new PlanStoreError("preview_not_found", "No plan matches that id and token.");
    }
    if (data.owner_user_id && data.owner_user_id !== callerUserId) {
      throw new PlanStoreError("preview_not_found", "No plan matches that id and token.");
    }
    if (new Date(data.expires_at as string).getTime() <= Date.now()) {
      throw new PlanStoreError("preview_expired", "This plan preview expired. Ask for the plan again to recreate it.");
    }
    return {
      id: data.id as string,
      plan: bookPlanSchema.parse(data.plan),
      segments: (data.source_segments as SourceSegment[]) ?? [],
      ownerUserId: (data.owner_user_id as string) ?? null,
      status: data.status as "active" | "saved",
      savedProjectId: (data.saved_project_id as string) ?? null,
      expiresAt: data.expires_at as string,
    };
  }

  /** Atomically create a new project from a preview. Retries return the first result. */
  async savePreviewAsNewProject(args: {
    userId: string;
    previewId: string;
    claimToken: string;
    idempotencyKey: string;
    plan: BookPlan;
  }): Promise<{ projectId: string; replayed: boolean }> {
    const asDraft = args.plan.input_mode === "import" && args.plan.import_kind === "draft";
    const chapters = args.plan.chapters.map((c) => ({ title: c.title, summary: c.summary, body: c.body }));
    const description = [args.plan.promise, args.plan.intended_reader ? `For: ${args.plan.intended_reader}` : ""]
      .filter(Boolean)
      .join("\n");
    const payloadHash = sha256(stableStringify({ previewId: args.previewId, plan: args.plan }));
    const { data, error } = await this.db.rpc("save_book_plan", {
      p_user_id: args.userId,
      p_idem_key: args.idempotencyKey,
      p_payload_hash: payloadHash,
      p_preview_id: args.previewId,
      p_claim_hash: sha256(args.claimToken),
      p_title: args.plan.title,
      p_audience: args.plan.audience,
      p_description: description,
      p_chapters: chapters,
      p_as_draft: asDraft,
    });
    if (error) throw mapRpcError(error.message);
    const row = data as { project_id: string; replayed: boolean };
    return { projectId: row.project_id, replayed: Boolean(row.replayed) };
  }

  /** Best-effort retention sweep (expired previews and their source text). */
  async purgeExpired(): Promise<void> {
    await this.db.rpc("purge_expired_book_plans");
  }
}
