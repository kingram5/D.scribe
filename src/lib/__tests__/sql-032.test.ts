import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Runs migration 032 for real, in an embedded Postgres, on top of a stub of
 * the columns it touches (copied from 001 + later migrations). Proves the
 * transactional and idempotency claims rather than trusting a mock.
 */

const STUB = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key);
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'Untitled Project',
  description text not null default '',
  audience text not null default 'General' check (audience in ('General','Leadership','Christian Living')),
  status text not null default 'draft' check (status in ('draft','in_progress','complete','erased')),
  updated_at timestamptz not null default now()
);
create table chapters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  chapter_number integer not null,
  title text not null,
  summary text not null default '',
  key_point_ids jsonb not null default '[]',
  target_word_count integer not null default 3000,
  status text not null default 'outlined' check (status in ('outlined','generating','generated','edited')),
  sort_order integer not null default 0,
  unique (project_id, chapter_number)
);
create table chapter_contents (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  content text not null default '',
  word_count integer not null default 0,
  generation_params jsonb not null default '{}',
  version integer not null default 1,
  unique (chapter_id, version)
);
`;

const MIGRATION = readFileSync(path.resolve(__dirname, "../../../supabase/migrations/032_chatgpt_book_plans.sql"), "utf8");
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

let db: PGlite;

async function newPreview(owner: string | null, claimHash = "h1", expires = "now() + interval '1 day'"): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into book_plan_previews (owner_user_id, claim_token_hash, input_mode, schema_version, plan, expires_at)
     values ($1, $2, 'import', 1, '{}'::jsonb, ${expires}) returning id`,
    [owner, claimHash]
  );
  return r.rows[0].id;
}

async function save(user: string, key: string, preview: string, opts: { hash?: string; claim?: string; chapters?: unknown; draft?: boolean } = {}) {
  const chapters = opts.chapters ?? [{ title: "One", summary: "s1", body: "Body one words here" }, { title: "Two", summary: "s2" }];
  const r = await db.query<{ save_book_plan: { project_id: string; replayed: boolean } }>(
    `select save_book_plan($1, $2, $3, $4, $5, 'Title', 'General', 'desc', $6::jsonb, $7)`,
    [user, key, opts.hash ?? "payload-a", preview, opts.claim ?? "h1", JSON.stringify(chapters), opts.draft ?? false]
  );
  return r.rows[0].save_book_plan;
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(`insert into auth.users values ('${ALICE}'), ('${BOB}');`);
  await db.exec(MIGRATION);
});

describe("save_book_plan", () => {
  it("creates a new project with chapters in one transaction", async () => {
    const p = await newPreview(null);
    const res = await save(ALICE, "key-00001", p);
    expect(res.replayed).toBe(false);
    const proj = await db.query<{ user_id: string; created_via: string }>(`select user_id, created_via from projects where id = $1`, [res.project_id]);
    expect(proj.rows[0]).toEqual({ user_id: ALICE, created_via: "chatgpt" });
    const ch = await db.query(`select chapter_number, title, summary from chapters where project_id = $1 order by chapter_number`, [res.project_id]);
    expect(ch.rows).toEqual([
      { chapter_number: 1, title: "One", summary: "Body one words here" },
      { chapter_number: 2, title: "Two", summary: "s2" },
    ]);
    const prev = await db.query<{ status: string; owner_user_id: string }>(`select status, owner_user_id from book_plan_previews where id = $1`, [p]);
    expect(prev.rows[0]).toEqual({ status: "saved", owner_user_id: ALICE });
  });

  it("draft imports land as chapter content version 1, untouched", async () => {
    const p = await newPreview(ALICE);
    const res = await save(ALICE, "key-00002", p, { draft: true, chapters: [{ title: "One", summary: "preview", body: "Exact   draft\ntext." }] });
    const c = await db.query<{ content: string; status: string; word_count: number }>(
      `select cc.content, ch.status, cc.word_count from chapter_contents cc join chapters ch on ch.id = cc.chapter_id where ch.project_id = $1`,
      [res.project_id]
    );
    expect(c.rows[0]).toEqual({ content: "Exact   draft\ntext.", status: "edited", word_count: 3 });
  });

  it("a retry with the same key returns the first result without duplicating", async () => {
    const p = await newPreview(null);
    const a = await save(ALICE, "key-00003", p);
    const b = await save(ALICE, "key-00003", p);
    expect(b).toEqual({ project_id: a.project_id, replayed: true });
    const n = await db.query<{ n: number }>(`select count(*)::int as n from projects`);
    expect(n.rows[0].n).toBe(1);
  });

  it("rejects reuse of a key with a different payload", async () => {
    const p = await newPreview(null);
    await save(ALICE, "key-00004", p);
    await expect(save(ALICE, "key-00004", p, { hash: "payload-b" })).rejects.toThrow(/idempotency_conflict/);
  });

  it("a second save of the same preview under a new key is refused", async () => {
    const p = await newPreview(null);
    const a = await save(ALICE, "key-00005", p);
    await expect(save(ALICE, "key-00006", p)).rejects.toThrow(new RegExp(`preview_already_saved:${a.project_id}`));
  });

  it("another account cannot claim an owned preview, and gets not-found (no oracle)", async () => {
    const p = await newPreview(ALICE);
    await expect(save(BOB, "key-00007", p)).rejects.toThrow(/preview_not_found/);
  });

  it("a wrong claim token is not-found", async () => {
    const p = await newPreview(null);
    await expect(save(ALICE, "key-00008", p, { claim: "wrong" })).rejects.toThrow(/preview_not_found/);
  });

  it("expired previews cannot be saved", async () => {
    const p = await newPreview(null, "h1", "now() - interval '1 minute'");
    await expect(save(ALICE, "key-00009", p)).rejects.toThrow(/preview_expired/);
  });

  it("a failed save leaves nothing behind (idempotency row rolls back too)", async () => {
    const p = await newPreview(null);
    // Audience outside the check constraint makes the project insert fail mid-function.
    await expect(
      db.query(`select save_book_plan($1, 'key-00010', 'x', $2, 'h1', 'T', 'Not An Audience', '', '[{"title":"a"}]'::jsonb, false)`, [ALICE, p])
    ).rejects.toThrow();
    const counts = await db.query<{ p: number; i: number; s: string }>(
      `select (select count(*)::int from projects) as p, (select count(*)::int from plan_idempotency) as i, (select status from book_plan_previews where id = '${p}') as s`
    );
    expect(counts.rows[0]).toEqual({ p: 0, i: 0, s: "active" });
    // and the same key works afterwards
    expect((await save(ALICE, "key-00010", p, { hash: "x" })).replayed).toBe(false);
  });
});

describe("replace_project_outline", () => {
  async function seedProject(owner: string) {
    const pr = await db.query<{ id: string }>(`insert into projects (user_id, title) values ($1, 'Book') returning id`, [owner]);
    const id = pr.rows[0].id;
    const ch = await db.query<{ id: string }>(`insert into chapters (project_id, chapter_number, title, status) values ($1, 1, 'Old', 'generated') returning id`, [id]);
    await db.query(`insert into chapter_contents (chapter_id, content) values ($1, 'Written prose')`, [ch.rows[0].id]);
    return id;
  }

  it("swaps chapters atomically and snapshots the old ones with their content", async () => {
    const id = await seedProject(ALICE);
    const r = await db.query(`select title, chapter_number from replace_project_outline($1, $2, $3::jsonb)`, [
      id,
      ALICE,
      JSON.stringify([{ title: "New A" }, { title: "New B", key_point_ids: ["x"] }]),
    ]);
    expect(r.rows).toEqual([
      { title: "New A", chapter_number: 1 },
      { title: "New B", chapter_number: 2 },
    ]);
    const snap = await db.query<{ chapters: Array<{ title: string; contents: Array<{ content: string }> }> }>(
      `select chapters from outline_snapshots where project_id = $1`,
      [id]
    );
    expect(snap.rows[0].chapters[0].title).toBe("Old");
    expect(snap.rows[0].chapters[0].contents[0].content).toBe("Written prose");
  });

  it("a failing insert keeps the old chapters (no empty-project window)", async () => {
    const id = await seedProject(ALICE);
    await expect(db.query(`select * from replace_project_outline($1, $2, $3::jsonb)`, [id, ALICE, JSON.stringify([{ summary: "no title" }])])).rejects.toThrow();
    const left = await db.query<{ title: string }>(`select title from chapters where project_id = $1`, [id]);
    expect(left.rows).toEqual([{ title: "Old" }]);
  });

  it("refuses another user's project", async () => {
    const id = await seedProject(ALICE);
    await expect(db.query(`select * from replace_project_outline($1, $2, '[{"title":"x"}]'::jsonb)`, [id, BOB])).rejects.toThrow(/project_not_found/);
  });

  it("keeps at most 10 snapshots per project", async () => {
    const id = await seedProject(ALICE);
    for (let i = 0; i < 13; i++) {
      await db.query(`select * from replace_project_outline($1, $2, $3::jsonb)`, [id, ALICE, JSON.stringify([{ title: `v${i}` }])]);
    }
    const n = await db.query<{ n: number }>(`select count(*)::int as n from outline_snapshots where project_id = $1`, [id]);
    expect(n.rows[0].n).toBe(10);
  });
});

describe("retention", () => {
  it("purges expired previews (and their source text) only", async () => {
    await newPreview(null, "a", "now() - interval '1 minute'");
    const live = await newPreview(null, "b");
    const r = await db.query<{ purge_expired_book_plans: number }>(`select purge_expired_book_plans()`);
    expect(r.rows[0].purge_expired_book_plans).toBe(1);
    const left = await db.query<{ id: string }>(`select id from book_plan_previews`);
    expect(left.rows.map((x) => x.id)).toEqual([live]);
  });
});
