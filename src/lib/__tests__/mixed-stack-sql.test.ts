import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const uid = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  project = "00000000-0000-4000-8000-000000000003",
  chapter = "00000000-0000-4000-8000-000000000004",
  run = "00000000-0000-4000-8000-000000000005",
  question = "00000000-0000-4000-8000-000000000006";
let db: PGlite;
const migration = (name: string) =>
  readFileSync(`supabase/migrations/${name}`, "utf8");
function sqlFunction(source: string, name: string) {
  const start = source.indexOf(`create or replace function ${name}(`);
  const end = source.indexOf("$$ language plpgsql security definer;", start);
  if (start < 0 || end < 0) throw new Error(name);
  return source.slice(
    start,
    end + "$$ language plpgsql security definer;".length,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
 create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as 'select null::uuid';
 create table auth.users(id uuid primary key);
 create table projects(id uuid primary key,user_id uuid not null);
 create table chapters(id uuid primary key,project_id uuid,title text,chapter_number integer,status text);
 create table chapter_contents(id uuid primary key default gen_random_uuid(),chapter_id uuid,content text,word_count integer,generation_params jsonb,version integer,unique(chapter_id,version));
 create table audio_uploads(id uuid primary key,project_id uuid,status text,duration_seconds numeric);
 create table transcripts(id uuid primary key default gen_random_uuid(),audio_upload_id uuid,project_id uuid,full_text text,segments jsonb,word_count integer,speaker_count integer);
 create table ink_balances(user_id uuid primary key,ink_balance numeric default 0,topup_ink numeric default 0,lifetime_used numeric default 0,tier text default 'pro',tts_chars_used integer default 0,topup_tts_chars integer default 0,tts_period_start timestamptz default now(),last_refill_at timestamptz default now());
 create table ink_usage(id uuid default gen_random_uuid(),user_id uuid,project_id uuid,operation text,model text,input_tokens integer,output_tokens integer,flat_ink_cost numeric);
 create table ink_reservations(id uuid primary key default gen_random_uuid(),user_id uuid,operation text,ink_amount numeric,status text default 'active',expires_at timestamptz default now()+interval '15 minutes',settled_at timestamptz);
 `);
  const topups = migration("023_topups.sql");
  await db.exec(sqlFunction(topups, "reserve_ink"));
  await db.exec(
    sqlFunction(
      migration("018_ink_reservations.sql"),
      "release_ink_reservation",
    ),
  );
  await db.exec(sqlFunction(topups, "check_and_deduct_tts"));
  await db.exec(migration("027_ink_meter_v2.sql"));
  await db.exec(migration("029_publisher_ready.sql"));
  await db.exec(migration("202610080001_mixed_stack.sql"));
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(`truncate auth.users,projects,chapters,chapter_contents,audio_uploads,transcripts,ink_balances,ink_usage,ink_reservations,pr_runs cascade;
 insert into auth.users values('${uid}'),('${other}');insert into projects values('${project}','${uid}');
 insert into chapters values('${chapter}','${project}','First chapter',1,'outlined');
 insert into ink_balances(user_id,ink_balance)values('${uid}',1000),('${other}',1000);
 insert into pr_runs(id,project_id,user_id,models)values('${run}','${project}','${uid}','{"mixed":{"version":"mixed-v1","maxOperationUsd":1}}');
 insert into pr_questions(id,run_id,chapter_id,user_id,question,status)values('${question}','${run}','${chapter}','${uid}','When did you move?','asked');
 delete from ink_meter_settings where key='live_chars_per_second';`);
});
async function begin(
  step = "draft",
  actor = uid,
  ch: string | null = chapter,
  version = 0,
) {
  const result = await db.query<{ op: { id: string; state: string } }>(
    "select begin_mixed_operation($1,$2,$3,$4,$5,$6) as op",
    [
      actor,
      run,
      ch,
      `chapter:${ch}:${step}`,
      "fixture-input",
      JSON.stringify({ version }),
    ],
  );
  return result.rows[0].op;
}
async function attempt(
  op: string,
  cost = 0.1,
  state = "complete",
  usage = "reported",
) {
  await db.query(
    "insert into ai_attempts(operation_id,call_key,ordinal,provider,model,route,input_hash,state,vendor_cost_usd,usage)values($1,'draft',1,'openai','fixture','{}','fixture',$2,$3,$4)",
    [op, state, cost, JSON.stringify({ usageStatus: usage })],
  );
}
async function finish(
  op: string,
  step = "draft",
  output: unknown = {
    text: "I moved in 1999.",
    beats: [],
    result: { wordCount: 5 },
  },
) {
  return db.query<{ result: { version: number } }>(
    "select finish_mixed_step($1,$2,$3,$4) as result",
    [uid, op, step, JSON.stringify(output)],
  );
}
const one = async (sql: string) =>
  (await db.query<Record<string, unknown>>(sql)).rows[0];
describe("actual Postgres functions: mixed accounting and manuscript transactions", () => {
  it("migration leaves historical rates/entitlements intact and exposes no client mutation permission", async () => {
    expect(
      await one(
        "select value from ink_meter_settings where key='ink_per_vendor_dollar'",
      ),
    ).toEqual({ value: "102" });
    expect(
      await one(
        "select has_function_privilege('authenticated','begin_mixed_operation(uuid,uuid,uuid,text,text,jsonb)','execute') as allowed",
      ),
    ).toEqual({ allowed: false });
    expect(
      await one(
        "select has_table_privilege('authenticated','ai_attempts','select') as allowed",
      ),
    ).toEqual({ allowed: false });
  });
  it("rejects wrong actors and chapter/run mismatches before any reservation", async () => {
    await expect(begin("draft", other)).rejects.toThrow(/Run unavailable/);
    await expect(begin("draft", uid, other)).rejects.toThrow(/mismatch/);
    expect(
      await one("select count(*)::int as n from ink_reservations"),
    ).toEqual({ n: 0 });
  });
  it("reserves once under competing requests and rejects insufficient available Ink", async () => {
    await db.exec(
      `update ink_balances set ink_balance=150 where user_id='${uid}'`,
    );
    const results = await Promise.allSettled([begin(), begin()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(begin("edit")).rejects.toThrow(/Insufficient Ink/);
    expect(
      await one("select count(*)::int as n from ink_reservations"),
    ).toEqual({ n: 1 });
  });
  it("commits a manuscript and settles exactly once on duplicate completion", async () => {
    const op = await begin();
    await attempt(op.id);
    const a = await finish(op.id),
      b = await finish(op.id);
    expect(a.rows).toEqual(b.rows);
    expect(
      await one("select count(*)::int as n from chapter_contents"),
    ).toEqual({ n: 1 });
    expect(await one("select count(*)::int as n from ink_usage")).toEqual({
      n: 1,
    });
    expect(
      await one(`select ink_balance from ink_balances where user_id='${uid}'`),
    ).toEqual({ ink_balance: "989.8000" });
  });
  it("retains paid unknown failures without customer debit or manuscript mutation", async () => {
    const op = await begin();
    await attempt(op.id, 0.1, "reconcile", "unknown");
    await expect(finish(op.id)).rejects.toThrow(/reconciliation/);
    expect(
      await one("select count(*)::int as n from chapter_contents"),
    ).toEqual({ n: 0 });
    expect(await one("select count(*)::int as n from ink_usage")).toEqual({
      n: 0,
    });
    expect(await one("select count(*)::int as n from ai_attempts")).toEqual({
      n: 1,
    });
  });
  it("resumes only reconciled checkpoints and retains attempt/result identities", async () => {
    const op = await begin();
    await attempt(op.id);
    await db.query(
      "update ai_operations set state='review_needed' where id=$1",
      [op.id],
    );
    await db.query(
      "select reopen_mixed_operation($1,'Verified complete attempt; persistence failed before commit')",
      [op.id],
    );
    expect((await begin()).id).toBe(op.id);
    await finish(op.id);
    expect(await one("select count(*)::int as n from ai_attempts")).toEqual({
      n: 1,
    });
  });
  it("rolls all manuscript writes back if reservation settlement fails", async () => {
    const op = await begin();
    await attempt(op.id);
    await db.exec(
      "update ink_reservations set expires_at=now()-interval '1 minute'",
    );
    await expect(finish(op.id)).rejects.toThrow(/unavailable/);
    expect(
      await one("select count(*)::int as n from chapter_contents"),
    ).toEqual({ n: 0 });
    expect(
      await one("select count(*)::int as n from pr_chapter_passes"),
    ).toEqual({ n: 0 });
  });
  it("rejects stale manuscript versions and budget exceptions without approval", async () => {
    const op = await begin();
    await attempt(op.id, 2);
    await expect(finish(op.id)).rejects.toThrow(/budget/);
    await db.exec("update ai_attempts set vendor_cost_usd=.1");
    await db.exec(
      `insert into chapter_contents(chapter_id,content,version)values('${chapter}','User correction',1)`,
    );
    await expect(finish(op.id)).rejects.toThrow(/changed/);
  });
  it("executes draft, edit, revise, final with preserved source and per-step checkpoints", async () => {
    const draft = await begin();
    await attempt(draft.id);
    await finish(draft.id);
    const edit = await begin("edit", uid, chapter, 1);
    await attempt(edit.id);
    await finish(edit.id, "edit", {
      report: {
        author_questions: [
          {
            question: "Which city?",
            why: "Source omits city",
            impact: 4,
            beat_id: null,
          },
        ],
        craft_notes: [],
        scores: {},
        summary: "Ask the author",
      },
      scores: {},
      result: { questions: 1 },
    });
    const revise = await begin("revise", uid, chapter, 1);
    await attempt(revise.id);
    await finish(revise.id, "revise", {
      text: "I moved in 1999. It was spring.",
      changeLog: [],
      resolved_notes: [],
      result: { changes: 1 },
    });
    const final = await begin("final", uid, chapter, 2);
    await attempt(final.id);
    await finish(final.id, "final", {
      result: { applied: 0 },
      scores: { flags_left: 0 },
    });
    expect(
      await one("select count(*)::int as n from pr_chapter_passes"),
    ).toEqual({ n: 4 });
    expect(
      await one("select count(*)::int as n from chapter_contents"),
    ).toEqual({ n: 2 });
    expect(
      (
        await db.query<{ content: string }>(
          "select content from chapter_contents order by version desc limit 1",
        )
      ).rows[0].content,
    ).toContain("1999");
  });
});
describe("Live existing-entitlement reservation and settlement", () => {
  const price = JSON.stringify({ version: "fixture", usdPerMinute: 0.05 });
  const reserve = () =>
    db.query<{ s: { id: string } }>(
      "select reserve_theo_live($1,$2,$3,60,$4) as s",
      [uid, run, question, price],
    );
  it("cannot invent a minute entitlement without approved conversion", async () => {
    await expect(reserve()).rejects.toThrow(/not approved/);
  });
  it("holds existing voice characters, forbids concurrent sessions, saves only author words, and refunds once", async () => {
    await db.exec(
      "insert into ink_meter_settings(key,value)values('live_chars_per_second',10)",
    );
    const id = (await reserve()).rows[0].s.id;
    await expect(reserve()).rejects.toThrow(/active/);
    expect(
      await one(
        `select tts_chars_used from ink_balances where user_id='${uid}'`,
      ),
    ).toEqual({ tts_chars_used: 600 });
    await db.query(
      "insert into theo_live_events values($1,'event1','user','Actually 1998.',0,1000,now()),($1,'event2','assistant','Was it spring?',1001,2000,now())",
      [id],
    );
    const settled = await db.query(
      "select settle_theo_live($1,'{\"seconds\":20}') as answer",
      [id],
    );
    const duplicate = await db.query(
      "select settle_theo_live($1,'{\"seconds\":20}') as answer",
      [id],
    );
    expect(settled.rows).toEqual(duplicate.rows);
    expect(
      await one(
        `select tts_chars_used from ink_balances where user_id='${uid}'`,
      ),
    ).toEqual({ tts_chars_used: 200 });
    expect(await one("select transcript from pr_answers")).toEqual({
      transcript: "Actually 1998.",
    });
  });
  it("does not settle orphan usage as zero", async () => {
    await db.exec(
      "insert into ink_meter_settings(key,value)values('live_chars_per_second',10)",
    );
    const id = (await reserve()).rows[0].s.id;
    await expect(
      db.query("select settle_theo_live($1,'{}')", [id]),
    ).rejects.toThrow(/duration missing/);
    await expect(reserve()).rejects.toThrow(/active/);
  });
});
