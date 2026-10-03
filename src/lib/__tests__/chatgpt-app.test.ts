import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { PlanStoreError, sha256, type PlanStore, type StoredPreview } from "@/lib/book-plan/persist";
import type { BookPlan } from "@/lib/book-plan/schema";
import type { SourceSegment } from "@/lib/book-plan/normalize";
import { checkClaims, decodeClaims, TokenError, bearerFrom } from "@/lib/chatgpt-app/token";
import { sanitizeProps } from "@/lib/chatgpt-app/events";
import {
  getPlanStatus,
  getProjectSummary,
  listProjects,
  previewBookPlan,
  saveBookPlan,
  type InkPort,
  type ToolDeps,
} from "@/lib/chatgpt-app/tools";

// ------------------------------------------------------------------ fakes

/** In-memory twin of PlanStore + migration 032 semantics (the SQL itself is tested in sql-032.test.ts). */
class FakeStore {
  previews = new Map<string, StoredPreview & { claimHash: string; ownerUserId: string | null }>();
  idem = new Map<string, { hash: string; result: { projectId: string } }>();
  projects: Array<{ id: string; user_id: string; title: string; chapters: number }> = [];
  failNextSave = false;

  async createPreview(a: { plan: BookPlan; segments: SourceSegment[]; ownerUserId: string | null }) {
    const id = randomUUID();
    const claimToken = randomUUID() + randomUUID();
    const expiresAt = new Date(Date.now() + 48 * 3600_000).toISOString();
    this.previews.set(id, { id, plan: a.plan, segments: a.segments, ownerUserId: a.ownerUserId, status: "active", savedProjectId: null, expiresAt, claimHash: sha256(claimToken) });
    return { id, claimToken, expiresAt };
  }
  async getPreview(id: string, token: string, caller: string | null) {
    const p = this.previews.get(id);
    if (!p || p.claimHash !== sha256(token)) throw new PlanStoreError("preview_not_found", "nf");
    if (p.ownerUserId && p.ownerUserId !== caller) throw new PlanStoreError("preview_not_found", "nf");
    if (new Date(p.expiresAt).getTime() <= Date.now()) throw new PlanStoreError("preview_expired", "exp");
    return p;
  }
  private lock: Promise<unknown> = Promise.resolve();
  // Serialized like the row lock + primary key in save_book_plan.
  savePreviewAsNewProject(a: { userId: string; previewId: string; claimToken: string; idempotencyKey: string; plan: BookPlan }) {
    const run = this.lock.then(() => this.saveLocked(a));
    this.lock = run.catch(() => undefined);
    return run;
  }
  private async saveLocked(a: { userId: string; previewId: string; claimToken: string; idempotencyKey: string; plan: BookPlan }) {
    const key = `${a.userId}|${a.idempotencyKey}`;
    const hash = sha256(JSON.stringify(a.plan) + a.previewId);
    const prior = this.idem.get(key);
    if (prior) {
      if (prior.hash !== hash) throw new PlanStoreError("idempotency_conflict", "c");
      return { projectId: prior.result.projectId, replayed: true };
    }
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new PlanStoreError("storage_error", "boom");
    }
    const p = await this.getPreview(a.previewId, a.claimToken, a.userId);
    if (p.status === "saved") throw new PlanStoreError("preview_already_saved", "s", p.savedProjectId ?? undefined);
    const projectId = randomUUID();
    this.projects.push({ id: projectId, user_id: a.userId, title: a.plan.title, chapters: a.plan.chapters.length });
    p.status = "saved";
    p.savedProjectId = projectId;
    p.ownerUserId = a.userId;
    this.idem.set(key, { hash, result: { projectId } });
    return { projectId, replayed: false };
  }
  async purgeExpired() {}
}

/** Tiny PostgREST-shaped query fake for the read tools. */
function fakeDb(projects: Array<Record<string, unknown>>, chapters: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      const rows = table === "projects" ? projects : chapters;
      let filtered = [...rows];
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => ((filtered = filtered.filter((r) => r[col] === val)), q),
        neq: (col: string, val: unknown) => ((filtered = filtered.filter((r) => r[col] !== val)), q),
        order: () => q,
        range: (a: number, b: number) => Promise.resolve({ data: filtered.slice(a, b + 1), error: null }),
        maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
        then: (res: (v: unknown) => void) => res({ data: filtered, error: null }),
      };
      return q;
    },
  };
}

class FakeInk implements InkPort {
  balance = 10;
  settled: Array<{ id: string; tokens: number }> = [];
  released: string[] = [];
  async reserve() {
    if (this.balance < 2) return { allowed: false, reason: "This needs about 2 Ink and you have 0." };
    return { allowed: true, reservationId: randomUUID() };
  }
  async settle(id: string, u: { input_tokens: number; output_tokens: number }) {
    if (this.settled.some((s) => s.id === id)) throw new Error("double settle");
    this.settled.push({ id, tokens: u.input_tokens + u.output_tokens });
  }
  async release(id: string) {
    this.released.push(id);
  }
}

const ALICE = { userId: "11111111-1111-4111-8111-111111111111", email: "alice@example.com" };
const BOB = { userId: "22222222-2222-4222-8222-222222222222", email: "bob@example.com" };

function deps(identity: typeof ALICE | null, store: FakeStore, extra: Partial<ToolDeps> = {}): ToolDeps {
  return {
    identity,
    store: store as unknown as PlanStore,
    db: fakeDb([], []) as never,
    ink: new FakeInk(),
    rateLimit: async () => true,
    anonSubject: "subj-1",
    ...extra,
  };
}

const TRANSCRIPT = "I was fired ten years ago.\n\nRest is a strategy, not a reward.\n\nServe one person at a time.";
const PROPOSAL = {
  title: "Not Your Title",
  chapters: [
    { title: "Fired", summary: "The morning it changed.", source_refs: [{ segment_id: "s1", quote: "I was fired" }] },
    { title: "Rest", summary: "On purpose.", source_refs: [{ segment_id: "s1" }] },
  ],
};

const env = { ...process.env };
beforeEach(() => {
  process.env.CHATGPT_APP_ANON_PREVIEW = "true";
  process.env.CHATGPT_APP_WRITES = "true";
  process.env.CHATGPT_APP_PAID_GENERATION = "true";
});
afterEach(() => {
  process.env = { ...env };
});

// ------------------------------------------------------------------ journeys

describe("anonymous preview, then linking, then save", () => {
  it("preserves the plan through linking and saves exactly once", async () => {
    const store = new FakeStore();
    const preview = await previewBookPlan({ mode: "source", source_text: TRANSCRIPT, proposed_plan: PROPOSAL }, deps(null, store));
    expect(preview.isError).toBeFalsy();
    const sc = preview.structuredContent as { preview_id: string; claim_token: string; saved: boolean };
    expect(sc.saved).toBe(false);
    expect(store.projects).toHaveLength(0); // previews never write projects

    // Anonymous save asks for linking with a WWW-Authenticate challenge.
    const unlinked = await saveBookPlan({ preview_id: sc.preview_id, claim_token: sc.claim_token }, deps(null, store));
    expect(unlinked.isError).toBe(true);
    expect((unlinked._meta as Record<string, string[]>)["mcp/www_authenticate"][0]).toMatch(/resource_metadata=/);

    // After linking: same ids, no resend of the material.
    const saved = await saveBookPlan({ preview_id: sc.preview_id, claim_token: sc.claim_token }, deps(ALICE, store));
    expect(saved.isError).toBeFalsy();
    const s = saved.structuredContent as { project_id: string; project_url: string; replayed: boolean };
    expect(s.project_url).toMatch(new RegExp(`/project/${s.project_id}$`));
    expect(store.projects).toHaveLength(1);

    // Callback retry / double click: same project, no duplicate.
    const again = await saveBookPlan({ preview_id: sc.preview_id, claim_token: sc.claim_token }, deps(ALICE, store));
    expect((again.structuredContent as { project_id: string }).project_id).toBe(s.project_id);
    expect(store.projects).toHaveLength(1);
  });

  it("concurrent duplicate saves create one project", async () => {
    const store = new FakeStore();
    const sc = (await previewBookPlan({ mode: "import", import_text: "1. A\n2. B" }, deps(ALICE, store))).structuredContent as {
      preview_id: string;
      claim_token: string;
    };
    const results = await Promise.all([1, 2, 3].map(() => saveBookPlan({ preview_id: sc.preview_id, claim_token: sc.claim_token }, deps(ALICE, store))));
    const ids = new Set(results.map((r) => (r.structuredContent as { project_id?: string }).project_id));
    expect(store.projects).toHaveLength(1);
    expect(ids.size).toBe(1);
  });

  it("another account cannot claim a preview it guessed or stole", async () => {
    const store = new FakeStore();
    const sc = (await previewBookPlan({ mode: "import", import_text: "1. A\n2. B" }, deps(ALICE, store))).structuredContent as {
      preview_id: string;
      claim_token: string;
    };
    const bob = await saveBookPlan({ preview_id: sc.preview_id, claim_token: sc.claim_token }, deps(BOB, store));
    expect((bob.structuredContent as { error: { code: string } }).error.code).toBe("not_found");
    const guess = await saveBookPlan({ preview_id: sc.preview_id, claim_token: "x".repeat(32) }, deps(ALICE, store));
    expect((guess.structuredContent as { error: { code: string } }).error.code).toBe("not_found");
    expect(store.projects).toHaveLength(0);
  });

  it("an anonymous preview, once saved by Alice, cannot be saved again by Bob", async () => {
    const store = new FakeStore();
    const sc = (await previewBookPlan({ mode: "import", import_text: "1. A\n2. B" }, deps(null, store))).structuredContent as {
      preview_id: string;
      claim_token: string;
    };
    await saveBookPlan({ preview_id: sc.preview_id, claim_token: sc.claim_token }, deps(ALICE, store));
    const bob = await saveBookPlan({ preview_id: sc.preview_id, claim_token: sc.claim_token }, deps(BOB, store));
    expect(bob.isError).toBe(true);
    expect(store.projects).toHaveLength(1);
  });

  it("a failed save leaves nothing behind and can be retried", async () => {
    const store = new FakeStore();
    const sc = (await previewBookPlan({ mode: "import", import_text: "1. A\n2. B" }, deps(ALICE, store))).structuredContent as {
      preview_id: string;
      claim_token: string;
    };
    store.failNextSave = true;
    const failed = await saveBookPlan({ preview_id: sc.preview_id, claim_token: sc.claim_token }, deps(ALICE, store));
    expect((failed.structuredContent as { error: { code: string; retryable: boolean } }).error).toMatchObject({ code: "internal", retryable: true });
    expect(store.projects).toHaveLength(0);
    const ok = await saveBookPlan({ preview_id: sc.preview_id, claim_token: sc.claim_token }, deps(ALICE, store));
    expect(ok.isError).toBeFalsy();
    expect(store.projects).toHaveLength(1);
  });
});

describe("flags and limits", () => {
  it("anonymous previews are off unless the flag is on", async () => {
    process.env.CHATGPT_APP_ANON_PREVIEW = "false";
    const res = await previewBookPlan({ mode: "import", import_text: "1. A\n2. B" }, deps(null, new FakeStore()));
    expect((res.structuredContent as { error: { code: string } }).error.code).toBe("auth_required");
  });

  it("writes are off unless the flag is on", async () => {
    process.env.CHATGPT_APP_WRITES = "false";
    const res = await saveBookPlan({ preview_id: randomUUID(), claim_token: "x".repeat(32) }, deps(ALICE, new FakeStore()));
    expect((res.structuredContent as { error: { code: string } }).error.code).toBe("feature_disabled");
  });

  it("rate limits anonymous callers", async () => {
    const res = await previewBookPlan({ mode: "import", import_text: "1. A" }, deps(null, new FakeStore(), { rateLimit: async () => false }));
    expect((res.structuredContent as { error: { code: string } }).error.code).toBe("rate_limited");
  });

  it("anonymous limits key on ChatGPT's subject id plus a global ceiling, never on IP", async () => {
    const keys: string[] = [];
    const rl = async (k: string) => (keys.push(k), true);
    await previewBookPlan({ mode: "import", import_text: "1. A" }, deps(null, new FakeStore(), { rateLimit: rl }));
    expect(keys).toEqual(["chatgpt-preview-anon:global", "chatgpt-preview-anon:subj-1"]);
    keys.length = 0;
    await previewBookPlan({ mode: "import", import_text: "1. A" }, deps(null, new FakeStore(), { rateLimit: rl, anonSubject: null }));
    expect(keys).toEqual(["chatgpt-preview-anon:global"]);
  });

  it("oversized source gets an actionable error", async () => {
    const res = await previewBookPlan({ mode: "source", source_text: "x".repeat(120_001), proposed_plan: PROPOSAL }, deps(ALICE, new FakeStore()));
    expect((res.structuredContent as { error: { code: string; message: string } }).error).toMatchObject({ code: "invalid_input" });
  });

  it("source without a plan returns segments for ChatGPT to draft from, spending nothing", async () => {
    const ink = new FakeInk();
    const res = await previewBookPlan({ mode: "source", source_text: TRANSCRIPT }, deps(null, new FakeStore(), { ink }));
    expect((res.content[0] as { text: string }).text).toContain("[s1]");
    expect(ink.settled).toHaveLength(0);
  });
});

describe("D.scribe-model generation and Ink", () => {
  it("insufficient Ink is explained before any vendor call", async () => {
    const ink = new FakeInk();
    ink.balance = 0;
    let called = false;
    const res = await previewBookPlan(
      { mode: "source", source_text: TRANSCRIPT, use_dscribe_model: true },
      deps(ALICE, new FakeStore(), { ink, generate: (async () => ((called = true), {})) as never })
    );
    expect((res.structuredContent as { error: { code: string } }).error.code).toBe("insufficient_ink");
    expect(called).toBe(false);
  });

  it("requires a linked account", async () => {
    const res = await previewBookPlan({ mode: "source", source_text: TRANSCRIPT, use_dscribe_model: true }, deps(null, new FakeStore()));
    expect((res.structuredContent as { error: { code: string } }).error.code).toBe("auth_required");
  });

  it("settles exactly once on success", async () => {
    const ink = new FakeInk();
    const { buildPlanFromProposal } = await import("@/lib/book-plan/build");
    const { normalizeSource } = await import("@/lib/book-plan/normalize");
    const gen = async () => ({ ...buildPlanFromProposal(PROPOSAL, "source", normalizeSource(TRANSCRIPT)), usage: { input_tokens: 300, output_tokens: 200 } });
    const res = await previewBookPlan({ mode: "source", source_text: TRANSCRIPT, use_dscribe_model: true }, deps(ALICE, new FakeStore(), { ink, generate: gen as never }));
    expect(res.isError).toBeFalsy();
    expect(ink.settled).toEqual([expect.objectContaining({ tokens: 500 })]);
  });

  it("a billing failure after delivery still returns the plan", async () => {
    const ink = new FakeInk();
    ink.settle = async () => {
      throw new Error("ledger down");
    };
    const { buildPlanFromProposal } = await import("@/lib/book-plan/build");
    const { normalizeSource } = await import("@/lib/book-plan/normalize");
    const gen = async () => ({ ...buildPlanFromProposal(PROPOSAL, "source", normalizeSource(TRANSCRIPT)), usage: { input_tokens: 1, output_tokens: 1 } });
    const res = await previewBookPlan({ mode: "source", source_text: TRANSCRIPT, use_dscribe_model: true }, deps(ALICE, new FakeStore(), { ink, generate: gen as never }));
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as { plan: BookPlan }).plan.title).toBe("Not Your Title");
  });

  it("bills consumed tokens on malformed output, releases the hold on a pre-reply timeout", async () => {
    const { PlanGenerationError } = await import("@/lib/book-plan/generate");
    const ink = new FakeInk();
    const failing = async () => {
      throw new PlanGenerationError("bad", { input_tokens: 40, output_tokens: 10 }, true);
    };
    const r1 = await previewBookPlan({ mode: "source", source_text: TRANSCRIPT, use_dscribe_model: true }, deps(ALICE, new FakeStore(), { ink, generate: failing as never }));
    expect((r1.structuredContent as { error: { code: string } }).error.code).toBe("generation_unavailable");
    expect(ink.settled).toEqual([expect.objectContaining({ tokens: 50 })]);

    const ink2 = new FakeInk();
    const timeout = async () => {
      throw new PlanGenerationError("timeout", { input_tokens: 0, output_tokens: 0 }, true);
    };
    await previewBookPlan({ mode: "source", source_text: TRANSCRIPT, use_dscribe_model: true }, deps(ALICE, new FakeStore(), { ink: ink2, generate: timeout as never }));
    expect(ink2.settled).toHaveLength(0);
    expect(ink2.released).toHaveLength(1);
  });
});

describe("refinement and expiry", () => {
  it("refines from a stored preview without resending the material", async () => {
    const store = new FakeStore();
    const first = (await previewBookPlan({ mode: "source", source_text: TRANSCRIPT, proposed_plan: PROPOSAL }, deps(ALICE, store))).structuredContent as {
      preview_id: string;
      claim_token: string;
    };
    const refined = await previewBookPlan(
      { mode: "source", based_on: first, proposed_plan: { ...PROPOSAL, title: "Retitled" } },
      deps(ALICE, store)
    );
    const plan = (refined.structuredContent as { plan: BookPlan }).plan;
    expect(plan.title).toBe("Retitled");
    expect(plan.chapters[0].source_refs[0]).toEqual({ segment_id: "s1", quote: "I was fired" });
  });

  it("an expired preview gives a recovery message without leaking content", async () => {
    const store = new FakeStore();
    const sc = (await previewBookPlan({ mode: "import", import_text: "1. Secret chapter\n2. B" }, deps(ALICE, store))).structuredContent as {
      preview_id: string;
      claim_token: string;
    };
    store.previews.get(sc.preview_id)!.expiresAt = new Date(Date.now() - 1000).toISOString();
    const res = await getPlanStatus(sc, deps(ALICE, store));
    const err = (res.structuredContent as { error: { code: string; message: string } }).error;
    expect(err.code).toBe("preview_expired");
    expect(JSON.stringify(res)).not.toContain("Secret chapter");
  });
});

describe("read tools enforce ownership", () => {
  const projects = [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", user_id: ALICE.userId, title: "Alice Book", status: "draft", audience: "General", updated_at: "2026-10-01", description: "" },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", user_id: BOB.userId, title: "Bob Book", status: "draft", audience: "General", updated_at: "2026-10-01", description: "" },
  ];
  const chapters = [{ project_id: projects[0].id, chapter_number: 1, title: "One", summary: "s", status: "outlined" }];

  it("lists only the caller's projects", async () => {
    const res = await listProjects({}, deps(ALICE, new FakeStore(), { db: fakeDb(projects, chapters) as never }));
    const list = (res.structuredContent as { projects: Array<{ title: string }> }).projects;
    expect(list.map((p) => p.title)).toEqual(["Alice Book"]);
  });

  it("guessing another account's project id is indistinguishable from not found", async () => {
    const res = await getProjectSummary({ project_id: projects[1].id }, deps(ALICE, new FakeStore(), { db: fakeDb(projects, chapters) as never }));
    expect((res.structuredContent as { error: { code: string } }).error.code).toBe("not_found");
  });

  it("returns summaries, not manuscripts", async () => {
    const res = await getProjectSummary({ project_id: projects[0].id }, deps(ALICE, new FakeStore(), { db: fakeDb(projects, chapters) as never }));
    expect((res.structuredContent as { chapters: unknown[] }).chapters).toHaveLength(1);
  });

  it("read tools require a linked account", async () => {
    const res = await listProjects({}, deps(null, new FakeStore()));
    expect((res.structuredContent as { error: { code: string } }).error.code).toBe("auth_required");
  });
});

// ------------------------------------------------------------------ tokens

function jwt(claims: Record<string, unknown>): string {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "RS256" })}.${b(claims)}.sig`;
}

describe("token claim policy", () => {
  const issuer = "https://proj.supabase.co/auth/v1";
  const now = Date.UTC(2026, 9, 3) ;
  const base = { sub: ALICE.userId, iss: issuer, exp: now / 1000 + 3600, client_id: "chatgpt", scope: "openid email" };
  const opts = { issuer, allowedClients: [] as string[], requiredScopes: ["openid", "email"], now };

  it("accepts a well-formed OAuth token", () => {
    expect(checkClaims(base, opts)).toEqual({ clientId: "chatgpt", scopes: ["openid", "email"] });
  });
  it.each([
    ["expired", { ...base, exp: now / 1000 - 1 }],
    ["wrong_issuer", { ...base, iss: "https://evil.example/auth/v1" }],
    ["wrong_client", { ...base, client_id: undefined }],
    ["insufficient_scope", { ...base, scope: "openid" }],
    ["malformed", { ...base, sub: undefined }],
  ])("rejects %s", (reason, claims) => {
    expect(() => checkClaims(claims as never, opts)).toThrow(new TokenError(reason as never));
  });
  it("enforces the audience when configured", () => {
    expect(() => checkClaims({ ...base, aud: "authenticated" }, { ...opts, expectedAudience: "https://www.d-scribe.app/mcp" })).toThrow(TokenError);
    expect(checkClaims({ ...base, aud: ["https://www.d-scribe.app/mcp"] }, { ...opts, expectedAudience: "https://www.d-scribe.app/mcp/" }).clientId).toBe("chatgpt");
  });
  it("enforces the client allow-list when configured", () => {
    expect(() => checkClaims(base, { ...opts, allowedClients: ["other"] })).toThrow(new TokenError("wrong_client"));
  });
  it("decodes and rejects malformed tokens and headers", () => {
    expect(decodeClaims(jwt(base)).sub).toBe(ALICE.userId);
    expect(() => decodeClaims("abc")).toThrow(TokenError);
    expect(bearerFrom("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerFrom("Basic xyz")).toBeNull();
    expect(bearerFrom("Bearer has space")).toBeNull();
  });
});

describe("analytics never carry content", () => {
  it("drops titles, text, emails and tokens", () => {
    const out = sanitizeProps({ mode: "source", title: "My Secret Book", email: "a@b.c", claim_token: "x", chapters: 4, reason: "contains spaces!" });
    expect(out).toEqual({ mode: "source", chapters: 4 });
  });
});
