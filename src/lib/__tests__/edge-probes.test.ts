/**
 * EDGE PROBES — adversarial boundary tests. Loop 1, 2026-08-02.
 *
 * Every probe asserts the behaviour we WANT.
 *
 *   it()       — behaviour is already correct, this locks it in.
 *   it.fails() — KNOWN DEFECT. The assertion inside is what SHOULD be true.
 *                Vitest expects it to fail, so CI stays green. When someone
 *                fixes the underlying bug this probe turns RED — that is the
 *                signal to flip it back to it() and keep the guarantee.
 *
 * Findings write-up: C:\Answer\projects\dscribe-edge-test-2026-08-02.md
 */

import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { isDisposableEmail } from "../disposable-domains";
import { canonicalizeEmail } from "../email";
import { chunkTranscript, extractExcerptsForChapter } from "../chunker";
import { rateLimit } from "../rate-limit";
import { TIER_INK } from "../stripe";
import { estimateInkCost } from "../ink";
import { sanitizeGenerated } from "../sanitize-output";
import { scrubEvent } from "../../../sentry-scrub";
import { cleanJsonLite, TruncatedJsonError } from "../claude-lite";

describe("transcript editing: the two text copies must stay in sync", () => {
  // FIELD REPORT 2026-08-04 (Kyle): deleting sentences and saving appeared to do
  // nothing. The save worked — it wrote full_text — but the view renders
  // `segments`, which the save never touched. Two copies of the text, one
  // updated, and the screen showed the stale one while the AI pipeline
  // (chunkTranscript(full_text)) silently used the edited one.
  const page = () =>
    fs.readFileSync(
      path.resolve(__dirname, "..", "..", "app", "(main)", "project", "[projectId]", "transcript", "page.tsx"),
      "utf8"
    );

  it("every transcript PATCH writes segments alongside full_text", () => {
    const src = page();
    // Each PATCH body naming full_text must also name segments.
    const bodies = [...src.matchAll(/JSON\.stringify\(\{[\s\S]{0,400}?\}\)/g)].map((m) => m[0]);
    const textWrites = bodies.filter((b) => b.includes("full_text"));
    expect(textWrites.length).toBeGreaterThan(0);
    for (const body of textWrites) {
      expect(body).toContain("segments");
    }
  });

  it("full_text is derived from segments, never typed in independently", () => {
    expect(page()).toMatch(/function fullTextFromSegments/);
    expect(page()).toMatch(/fullTextFromSegments\(nextSegments\)/);
  });

  it("merged paragraphs carry the segment range they came from", () => {
    // Without fromIdx/toIdx an edited paragraph cannot be written back, which
    // is what made the reading view effectively read-only.
    const src = page();
    expect(src).toMatch(/fromIdx/);
    expect(src).toMatch(/toIdx/);
    expect(src).toMatch(/segments\.slice\(para\.fromIdx, para\.toIdx \+ 1\)/);
  });
});

describe("structure settings: the chapter count must actually persist", () => {
  // FIELD REPORT 2026-08-04 (Kyle): a NEW project set to 5 chapters generated 8
  // chapter notes. `projects.num_chapters` has a NOT NULL default of 8, and the
  // page ran `if (p.num_chapters) setHasSaved(true)` — true on first render of
  // every project. That flag gated the footer Next button, so the gate was
  // never on, Next was a bare link, and changing the stepper then clicking it
  // discarded the change silently.
  const structure = () =>
    fs.readFileSync(
      path.resolve(__dirname, "..", "..", "app", "(main)", "project", "[projectId]", "structure", "page.tsx"),
      "utf8"
    );

  it("does not infer 'saved' from a value that has a column default", () => {
    expect(structure()).not.toMatch(/if\s*\(p\.num_chapters\)\s*setHasSaved/);
  });

  it("the footer Next saves instead of navigating away bare", () => {
    expect(structure()).toMatch(/onNextClick=/);
  });

  it("settings auto-persist on change, so any exit route keeps them", () => {
    const src = structure();
    expect(src).toMatch(/saveSettings/);
    expect(src).toMatch(/dirtyRef/);
  });
});

describe("disposable-domains: bypass surface", () => {
  it("blocks the plain domain", () => {
    expect(isDisposableEmail("bot@mailinator.com")).toBe(true);
  });

  it("blocks regardless of case", () => {
    expect(isDisposableEmail("bot@MAILINATOR.COM")).toBe(true);
  });

  it("does not crash on malformed input", () => {
    expect(isDisposableEmail("")).toBe(false);
    expect(isDisposableEmail("no-at-sign")).toBe(false);
  });

  // DEFECT 4 — exact-match Set lookup, so any subdomain walks through.
  // Mailinator serves every *.mailinator.com address into the same public inbox.
  it("blocks arbitrary subdomains of a listed provider", () => {
    expect(isDisposableEmail("bot@anything.mailinator.com")).toBe(true);
  });

  // DEFECT 4b — "mailinator.com." is the fully-qualified form and resolves fine.
  it("blocks the fully-qualified trailing-dot form", () => {
    expect(isDisposableEmail("bot@mailinator.com.")).toBe(true);
  });
});

describe("rate-limit: keying assumptions the magic-link route depends on", () => {
  it("allows exactly `limit` requests then blocks", () => {
    const k = `probe-basic-${Math.random()}`;
    const results = Array.from({ length: 5 }, () => rateLimit(k, 3, 60_000));
    expect(results).toEqual([true, true, true, false, false]);
  });

  // FIXED (defect 2): /api/auth/magic-link now keys the per-email limiter on
  // canonicalizeEmail(email), so every dot/plus alias of one gmail inbox
  // collapses to ONE limiter key and shares one quota. The limiter itself is
  // key-agnostic — the guarantee lives in the canonicalisation, so that is
  // what the probe pins.
  it("gives gmail dot/plus aliases ONE shared quota, not one each", () => {
    const aliases = [
      "trialfarm@gmail.com",
      "trial.farm@gmail.com",
      "t.r.i.a.l.f.a.r.m@gmail.com",
      "trialfarm+1@gmail.com",
      "trialfarm+2@gmail.com",
      "TRIALFARM@GMAIL.COM",
      "trialfarm@googlemail.com",
    ];
    const keys = new Set(aliases.map((a) => canonicalizeEmail(a)));
    expect([...keys]).toEqual(["trialfarm@gmail.com"]);
  });
});

describe("chunker: boundary conditions", () => {
  it("chunking is lossless — every word survives into some chunk", () => {
    const words = Array.from({ length: 7000 }, (_, i) => `w${i}`);
    const chunks = chunkTranscript(words.join(" "));
    const seen = new Set(chunks.flatMap((c) => c.text.split(/\s+/)));
    expect(words.filter((w) => !seen.has(w))).toEqual([]);
  });

  it("startWord indexes correctly into the source word array", () => {
    const words = Array.from({ length: 7000 }, (_, i) => `w${i}`);
    const chunks = chunkTranscript(words.join(" "));
    for (const c of chunks) {
      expect(c.text.split(/\s+/)[0]).toBe(words[c.startWord]);
    }
  });

  // DEFECT 6 — a transcript with no words still yields one chunk, which the
  // analyze routes hand to Claude as a billable, meaningless request.
  it("empty transcript yields no chunks", () => {
    expect(chunkTranscript("")).toEqual([]);
  });

  it("whitespace-only transcript yields no chunks", () => {
    expect(chunkTranscript("   \n\t  ")).toEqual([]);
  });

  // DEFECT 7 (latent) — the sentence-boundary trim computes
  // `chunkWords.length - 50 + n`, which goes negative when a chunk is shorter
  // than the 50-word lookback. Assigning a negative .length throws RangeError.
  // Unreachable today (all callers use the 3000 default) and armed the moment
  // anyone parameterises the chunker for a smaller context window.
  it("survives a chunkSize below the 50-word lookback window", () => {
    const text = Array.from({ length: 60 }, (_, i) => `Alpha beta gamma delta epsilon number ${i}.`).join(" ");
    expect(() => chunkTranscript(text, 20, 5)).not.toThrow();
  });
});

describe("claude clients: the two of them must agree on what a tier means", () => {
  // FIXED (defect 49): the tiers once drifted apart because each client owned
  // its own map. claude-lite.ts is now the single source of truth and
  // claude-stream.ts imports it — agreement is structural, not coincidental.
  // These probes fail if anyone reintroduces a second MODELS map.
  const streamSrc = () => fs.readFileSync(path.resolve(__dirname, "..", "claude-stream.ts"), "utf8");
  const liteSrc = () => fs.readFileSync(path.resolve(__dirname, "..", "claude-lite.ts"), "utf8");

  it("claude-lite defines exactly one MODELS map with both tiers", () => {
    const src = liteSrc();
    const block = src.slice(src.indexOf("MODELS"), src.indexOf("};", src.indexOf("MODELS")));
    const map = Object.fromEntries([...block.matchAll(/(\w+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
    expect(map.fast).toBeTruthy();
    expect(map.quality).toBeTruthy();
  });

  it("claude-stream imports the shared map and defines none of its own", () => {
    const src = streamSrc();
    expect(src).toMatch(/import\s*\{\s*MODELS\s*\}\s*from\s*["']\.\/claude-lite["']/);
    expect(src.includes("const MODELS")).toBe(false);
  });
});

describe("cleanJsonLite: parsing model output", () => {
  it("strips markdown fences", () => {
    expect(JSON.parse(cleanJsonLite('```json\n{"a":1}\n```'))).toEqual({ a: 1 });
  });

  it("drops trailing commentary after the JSON", () => {
    expect(JSON.parse(cleanJsonLite('{"a":1}\n\nHope that helps!'))).toEqual({ a: 1 });
  });

  it("handles braces inside strings", () => {
    expect(JSON.parse(cleanJsonLite('{"a":"} not the end {"}'))).toEqual({ a: "} not the end {" });
  });

  // FIXED (defect 50): when max_tokens truncates the response mid-object,
  // cleanJsonLite now throws a NAMED TruncatedJsonError instead of returning
  // the broken string for JSON.parse to choke on anonymously — so callers can
  // retry with a larger budget, and (paired with parse-before-bill ordering)
  // the user is no longer charged for an error.
  it("signals truncated JSON rather than returning it as if it were valid", () => {
    const truncated = '{"chapters":[{"title":"One","summary":"a long sum';
    expect(() => cleanJsonLite(truncated)).toThrow(TruncatedJsonError);
  });
});

describe("sentry-scrub: what still leaves the building", () => {
  it("drops request bodies, cookies and auth headers", () => {
    const ev = scrubEvent({
      request: { data: { chapter: "secret" }, cookies: { sb: "x" }, headers: { authorization: "Bearer t", "user-agent": "ua" } },
    });
    expect(ev.request?.data).toBeUndefined();
    expect(ev.request?.cookies).toBeUndefined();
    expect(ev.request?.headers?.authorization).toBeUndefined();
    expect(ev.request?.headers?.["user-agent"]).toBe("ua");
  });

  it("drops long strings from extra", () => {
    const ev = scrubEvent({ extra: { chapter: "x".repeat(5000), boundary: "editor" } });
    expect(ev.extra?.chapter).toBeUndefined();
    expect(ev.extra?.boundary).toBe("editor");
  });

  // DEFECT 43 — the extra filter tests `typeof v === "string"`. Manuscript content
  // wrapped in an object or array sails straight through the content guard.
  it("drops long content nested in an object in extra", () => {
    const ev = scrubEvent({ extra: { payload: { content: "x".repeat(5000) } } });
    expect(ev.extra?.payload).toBeUndefined();
  });

  // DEFECT 44 — request.data and cookies are removed but the URL is not, and
  // /auth/confirm carries `token_hash`, a single-use auth credential, in its
  // query string. An error on that route ships the credential to Sentry.
  it("strips the query string from request.url", () => {
    const ev = scrubEvent({
      request: { url: "https://d-scribe.app/auth/confirm?token_hash=pkce_abc123&type=email" },
    } as Parameters<typeof scrubEvent>[0] & { request: { url: string } });
    expect((ev.request as { url?: string }).url ?? "").not.toContain("token_hash");
  });

  // DEFECT 45 — breadcrumbs are Sentry's other big leak channel (console calls,
  // fetch/XHR bodies) and scrubEvent never touches them.
  it("scrubs breadcrumbs", () => {
    const ev = scrubEvent({
      breadcrumbs: [{ category: "console", message: "chapter: " + "x".repeat(5000) }],
    } as unknown as Parameters<typeof scrubEvent>[0]);
    const crumbs = (ev as { breadcrumbs?: { message?: string }[] }).breadcrumbs ?? [];
    expect(crumbs.every((c) => (c.message?.length ?? 0) < 600)).toBe(true);
  });
});

describe("logger: how a Supabase error serialises", () => {
  // DEFECT 46 — lib/logger.ts:132-139 only unwraps `instanceof Error`; anything
  // else goes through String(). supabase-js returns a PLAIN OBJECT
  // ({message, details, hint, code}), so every logger.error(..., { error: dbErr })
  // call in the codebase records "[object Object]" and loses the real reason.
  // Asserting on String() rather than on pino's output, because the transport
  // runs in a worker thread and intercepting it would make this test flaky.
  it("String() on a Supabase-style error loses everything — this is what gets logged", () => {
    const supabaseErr = { message: "duplicate key violates unique constraint", code: "23505" };
    expect(String(supabaseErr)).toBe("[object Object]");
    expect(supabaseErr instanceof Error).toBe(false);
  });
});

describe("migrations: RLS is the only defence against direct PostgREST access", () => {
  // NEXT_PUBLIC_SUPABASE_ANON_KEY ships to the browser, so any user can talk to
  // PostgREST directly with their own JWT. The API routes all use the service-role
  // client, which bypasses RLS entirely — so for direct table access, policies are
  // the whole security model. A new table without RLS is a public table.
  function migrationSql(): string {
    const dir = path.resolve(__dirname, "../../../supabase/migrations");
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .join("\n");
  }

  it("finds the migrations (guards against reading nothing)", () => {
    expect(migrationSql().length).toBeGreaterThan(5000);
  });

  it("every created table has row level security enabled", () => {
    const sql = migrationSql();
    const created = [...sql.matchAll(/create table (?:if not exists )?(\w+)/gi)].map((m) => m[1]);
    const rlsOn = new Set([...sql.matchAll(/alter table (\w+) enable row level security/gi)].map((m) => m[1]));
    expect([...new Set(created)].filter((t) => !rlsOn.has(t))).toEqual([]);
  });

  // ink_balances is the wallet. A client-side INSERT/UPDATE policy here would let
  // users mint their own Ink, so read-own is the only policy that may exist.
  it("ink_balances exposes no client write policy", () => {
    const policies = [...migrationSql().matchAll(/create policy\s+"([^"]+)"\s+on ink_balances for (\w+)/gi)];
    expect(policies.map((m) => m[2].toLowerCase())).toEqual(["select"]);
  });
});

describe("claude-stream: usage accounting on the streaming path", () => {
  // Replays a real Anthropic SSE sequence. The Messages API puts input_tokens in
  // message_start.message.usage and output_tokens in message_delta.usage —
  // message_delta carries NO input_tokens. generate/route.ts:242 reads both
  // events correctly; claude-stream.ts:84 only listens to message_delta.
  function mockAnthropicSSE(inputTokens: number, outputTokens: number) {
    const events = [
      `data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: inputTokens, output_tokens: 1 } } })}`,
      `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "hello" } })}`,
      `data: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: outputTokens } })}`,
      "data: [DONE]",
    ].join("\n\n") + "\n\n";

    return {
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode(events));
          c.close();
        },
      }),
    } as unknown as Response;
  }

  async function captureUsage(inputTokens: number, outputTokens: number) {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => mockAnthropicSSE(inputTokens, outputTokens)) as typeof fetch;
    try {
      const { streamClaude } = await import("../claude-stream");
      let seen: { input_tokens: number; output_tokens: number } | null = null;
      const stream = streamClaude("sys", "msg", { onUsage: (u) => { seen = u; } });
      const reader = stream.getReader();
      while (!(await reader.read()).done) { /* drain */ }
      return seen as { input_tokens: number; output_tokens: number } | null;
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  it("reports output tokens", async () => {
    expect((await captureUsage(5000, 900))?.output_tokens).toBe(900);
  });

  // DEFECT 34 — input_tokens is read off message_delta, which never carries it,
  // so every rewrite/chapter call bills its input as ZERO. The input is the whole
  // current chapter plus adjacent chapter tails plus style memory, i.e. usually
  // the larger half of the call.
  it("reports input tokens", async () => {
    expect((await captureUsage(5000, 900))?.input_tokens).toBe(5000);
  });
});

describe("r2 presigned uploads: what the signature actually binds", () => {
  // Presigning is pure crypto, so dummy credentials exercise the real code path.
  async function signedHeaders(): Promise<string[]> {
    process.env.R2_ACCOUNT_ID ||= "probeacct";
    process.env.R2_ACCESS_KEY_ID ||= "AKIAPROBE";
    process.env.R2_SECRET_ACCESS_KEY ||= "secretprobe";
    const { getUploadUrl } = await import("../r2");
    const url = await getUploadUrl("proj/1-file.mp3", "audio/mpeg", 500 * 1024 * 1024);
    return (new URL(url).searchParams.get("X-Amz-SignedHeaders") || "").split(";");
  }

  // Good news, locked in: the 500 MB cap in upload-url/route.ts is real, because
  // content-length is part of the signature and R2 rejects a mismatched body.
  it("binds content-length, so the size cap is enforced by R2", async () => {
    expect(await signedHeaders()).toContain("content-length");
  });

  // DEFECT 29 — content-type is NOT signed. upload-url/route.ts:39 validates
  // content_type against ALLOWED_MIME_TYPES, but nothing stops the client from
  // sending a different Content-Type on the actual PUT. The allowlist is
  // advisory. Matters most if R2_PUBLIC_DOMAIN is ever set, which would turn the
  // bucket into a file host serving attacker-chosen content types on our domain.
  it("binds content-type, so the MIME allowlist is enforced", async () => {
    expect(await signedHeaders()).toContain("content-type");
  });
});

describe("sanitize-output: what it does to a real author's prose", () => {
  it("neutralises an actual AI cliché (control)", () => {
    expect(sanitizeGenerated("At the end of the day, we tried.")).toContain("ultimately");
  });

  // DEFECT 24 — brainstorm/route.ts:143 calls sanitizeGenerated on EACH SSE
  // delta instead of the assembled text. sanitizeGenerated ends in .trim(), so
  // every delta boundary loses its whitespace, and Claude's tokenizer emits
  // leading-space tokens constantly. The client does `aiText += parsed.text`
  // with no reinsertion, so the user sees words fused together. Knock-on: the
  // TTS sentence splitter needs \s+ after [.!?] and stops firing.
  // FIXED (defect 24) — by removing the premise. Per-delta sanitisation can
  // never equal whole-text sanitisation (the trailing trim eats the leading
  // space of every delta), so the brainstorm route now streams deltas RAW and
  // sanitizeGenerated is reserved for assembled chapter prose. This probe
  // fails if per-delta sanitisation ever creeps back into the route.
  it("brainstorm streams deltas raw — no per-delta sanitisation", () => {
    const route = fs.readFileSync(
      path.resolve(__dirname, "..", "..", "app", "api", "brainstorm", "route.ts"),
      "utf8"
    );
    expect(route).not.toMatch(/sanitizeGenerated/);
  });

  // DEFECT 25 — /\bnavigate (?:the |this |these )/gi replaces with "work through ",
  // consuming the article and never restoring it. Saved straight to the chapter.
  // FIXED (defects 25 + 28 together): "navigate" is a SOFT_TELL — only a tell
  // in figurative use — so the sanitizer now leaves it entirely alone rather
  // than rewriting it (grammatically or otherwise). The linter still flags it
  // at reduced weight; destructive rewriting of domain vocabulary is gone.
  it("does not eat the definite article after 'navigate'", () => {
    expect(sanitizeGenerated("We navigate the rate cycle.")).toBe("We navigate the rate cycle.");
  });

  // DEFECT 26 — phrase replacement runs over the whole chapter with no awareness
  // of quotation marks, so it silently rewrites what a real person was quoted
  // saying. On a product whose pitch is "your voice, your book".
  it("leaves text inside quotation marks alone", () => {
    const input = 'He told me: "At the end of the day, we tried."';
    expect(sanitizeGenerated(input)).toBe(input);
  });

  // DEFECT 27 — em dash as an interruption is standard dialogue punctuation.
  // /\s*—\s*/g turns it into ", ".
  it("preserves an em dash used as a dialogue interruption", () => {
    expect(sanitizeGenerated('"I was going to—" she stopped.')).toContain("—");
  });

  // DEFECT 28 — ai-tells.ts defines SOFT_TELLS precisely because navigate /
  // leverage / robust are legitimate in literal use, and the linter weights them
  // down. sanitize-output.ts never consults that set and rewrites unconditionally,
  // so domain vocabulary is destroyed: "3x leverage" (a noun) becomes "3x use".
  it("does not rewrite domain vocabulary used literally", () => {
    expect(sanitizeGenerated("The fund used 3x leverage.")).toContain("leverage");
  });
});

describe("architecture: service-role routes must self-enforce ownership", () => {
  // createServerClient() is the SERVICE ROLE client — it bypasses RLS entirely
  // (see lib/supabase.ts:12). So Postgres row-level security protects nothing on
  // the API surface, and every route that uses it has to hand-roll its own
  // ownership check. One route that forgets is a full IDOR.
  //
  // This test is the guard rail: any NEW route using the service role must
  // either scope by user_id or be consciously added to PUBLIC_ROUTES below.
  const PUBLIC_ROUTES = new Set([
    "blog",             // published-post read; writes gated by x-admin-key
    "blog/[slug]",      // same
    "discover",         // explicitly filters .eq("is_public", true)
    "health",           // liveness probe, no user data
    "stripe/webhook",   // authenticated by Stripe signature, not by session
  ]);

  function apiRoutes(): { route: string; src: string }[] {
    const root = path.resolve(__dirname, "../../app/api");
    const out: { route: string; src: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir)) {
        const p = path.join(dir, entry);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (entry === "route.ts") {
          out.push({
            route: path.relative(root, p).replace(/\\/g, "/").replace("/route.ts", ""),
            src: fs.readFileSync(p, "utf8"),
          });
        }
      }
    };
    walk(root);
    return out;
  }

  it("finds the API routes (guards against the walker silently matching nothing)", () => {
    expect(apiRoutes().length).toBeGreaterThan(30);
  });

  it("every service-role route either scopes by user_id or is a declared public route", () => {
    const offenders = apiRoutes()
      .filter((r) => /createServerClient\s*\(/.test(r.src))
      .filter((r) => !PUBLIC_ROUTES.has(r.route))
      .filter((r) => !/\.eq\(\s*["']user_id["']/.test(r.src))
      .map((r) => r.route);
    expect(offenders).toEqual([]);
  });

  it("every non-public route runs an auth guard", () => {
    const offenders = apiRoutes()
      .filter((r) => !PUBLIC_ROUTES.has(r.route))
      .filter((r) => r.route !== "auth/magic-link" && r.route !== "log-client-error")
      .filter((r) => !/requireAuth|requireUser|getUser\s*\(/.test(r.src))
      .map((r) => r.route);
    expect(offenders).toEqual([]);
  });
});

describe("billing: the two sources of truth must not drift", () => {
  // TIER_INK (TS) and tier_ink_allotment() (SQL, migration 012) both define the
  // per-tier allotment. The webhook refills from the TS copy; deduct_ink's lazy
  // 30-day safety-net refills from the SQL copy. If they diverge, the same user
  // gets a different balance depending on which path fired. Nothing binds them
  // together at build time, so this test is the binding.
  it("TIER_INK matches tier_ink_allotment() in migration 012", () => {
    expect(TIER_INK.starter).toBe(300);
    expect(TIER_INK.pro).toBe(660);
    expect(TIER_INK.premium).toBe(1500);
  });

  // Deliberate asymmetry: SQL knows 'free' => 10, TS does not. The webhook's
  // `TIER_INK[balance.tier] != null` guard is what keeps free accounts out of
  // the invoice refill path. Adding free here would silently open that gate.
  it("TIER_INK deliberately omits 'free' — the webhook guard depends on it", () => {
    expect(TIER_INK.free).toBeUndefined();
  });

  // estimateInkCost falls back to 0 for anything not in ESTIMATED_COST, which
  // turns the cost-aware pre-flight back into a bare "balance > 0" check.
  // Type-safe today; a runtime-supplied operation string would slip through.
  it("unknown operation yields a 0 floor (documents the fail-open)", () => {
    expect(estimateInkCost("not_a_real_op" as never)).toBe(0);
  });

  it("every priced operation has a positive floor", () => {
    const ops = [
      "brainstorm", "brainstorm_summarize", "analyze", "voice_profile",
      "mind_map", "outline", "generate", "foreword", "rewrite",
      "coherence", "enrich", "style_distill",
    ] as const;
    for (const op of ops) expect(estimateInkCost(op)).toBeGreaterThan(0);
  });
});

describe("extractExcerptsForChapter: LLM-supplied quote handling", () => {
  const fullText = "ALPHA beta gamma. " + "filler ".repeat(400) + "OMEGA delta.";

  it("returns a fallback slice when no quotes match", () => {
    const out = extractExcerptsForChapter(fullText, [["not present anywhere"]]);
    expect(out.length).toBeGreaterThan(0);
  });

  // DEFECT 5 — "".indexOf() returns 0 for any haystack, so an empty quote from
  // the model silently cites the first 200 characters of the transcript.
  // FIXED (defect 5): empty/whitespace quotes are filtered before matching, so
  // an empty quote behaves exactly like no quotes at all — the honest fallback
  // slice, not a fabricated "..."-wrapped excerpt citing the transcript's
  // opening as if the model had quoted it.
  it("ignores an empty-string quote instead of matching at index 0", () => {
    expect(extractExcerptsForChapter(fullText, [[""]])).toBe(extractExcerptsForChapter(fullText, []));
    expect(extractExcerptsForChapter(fullText, [["   "]])).toBe(extractExcerptsForChapter(fullText, []));
  });

  // DEFECT 5b — no dedup. The same quote cited by three key points ships three
  // identical ~400-char excerpts into the generate prompt.
  it("does not duplicate excerpt text for a repeated quote", () => {
    const q = "ALPHA beta gamma";
    const out = extractExcerptsForChapter(fullText, [[q], [q], [q]]);
    expect(out.split("ALPHA").length - 1).toBe(1);
  });
});
