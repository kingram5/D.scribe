import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
async function main() {
  const address = process.env.DSCRIBE_TEST_DATABASE_URL;
  if (!address)
    throw new Error(
      "Set DSCRIBE_TEST_DATABASE_URL to a disposable local PostgreSQL cluster.",
    );
  const url = new URL(address);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new Error("Database tests require a local disposable cluster.");
  const admin = new pg.Client({ connectionString: address });
  await admin.connect();
  const name = "pr_test_" + randomUUID().replaceAll("-", "");
  await admin.query(`create database ${name}`);
  url.pathname = "/" + name;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 8 });
  let checks = 0;
  const check = (condition: unknown, label: string) => {
    assert.ok(condition, label);
    checks++;
    console.log("PASS", label);
  };
  try {
    for (const role of ["anon", "authenticated", "service_role"])
      if (
        !(await admin.query("select 1 from pg_roles where rolname=$1", [role]))
          .rowCount
      )
        await admin.query(
          `create role ${role}${role === "service_role" ? " bypassrls" : ""}`,
        );
    await pool.query(
      `create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`,
    );
    for (const file of readdirSync("supabase/migrations").sort()) {
      if (file.startsWith("030_")) continue; // pricing activation is outside this migration
      // Existing 023 changes this function's return shape without dropping its old signature.
      // Adapt ONLY the empty disposable fixture, never historical migration files or a remote DB.
      if (file === "023_topups.sql")
        await pool.query("drop function ensure_ink_balance(uuid,text[])");
      await pool.query(readFileSync("supabase/migrations/" + file, "utf8"));
    }
    check(
      true,
      "new migrations apply over historical schema (local 023 fixture adaptation; 030 excluded)",
    );
    const user = randomUUID(),
      project = randomUUID(),
      run = randomUUID(),
      chapter = randomUUID();
    await pool.query("insert into auth.users(id) values($1)", [user]);
    await pool.query(
      "insert into ink_balances(user_id,ink_balance,tier) values($1,1000,'pro')",
      [user],
    );
    await pool.query("insert into projects(id,user_id) values($1,$2)", [
      project,
      user,
    ]);
    await pool.query(
      "insert into chapters(id,project_id,chapter_number,title) values($1,$2,1,'Fixture')",
      [chapter, project],
    );
    await pool.query(
      "insert into pr_runs(id,user_id,project_id,status,models) values($1,$2,$3,'editing','{\"provider\":\"openai\"}')",
      [run, user, project],
    );
    await pool.query(
      "update ink_meter_settings set value=99 where key='ink_per_vendor_dollar'",
    );
    const begin = (key: string, usd = 1) =>
      pool.query("select pr_begin_ai_call($1,$2,$3,$4,$5,$6,$7) as r", [
        run,
        user,
        key,
        "draft",
        "test-model",
        "fixture",
        usd,
      ]);
    const claims = await Promise.all([begin("same"), begin("same")]);
    check(
      claims.filter((r) => !r.rows[0].r.existing).length === 1,
      "concurrent calls purchase one attempt",
    );
    const id = claims[0].rows[0].r.call.id;
    const result = {
      text: "Author words",
      servedBy: "test-model",
      usage: { input_tokens: 100, output_tokens: 100 },
    };
    await pool.query("select pr_observe_ai_call($1,$2,$3,$4,$5,$6,$7)", [
      id,
      "response",
      "request",
      0.5,
      {},
      result,
      null,
    ]);
    const settled = await Promise.all([
      pool.query("select pr_settle_ai_call($1) as r", [id]),
      pool.query("select pr_settle_ai_call($1) as r", [id]),
    ]);
    check(
      settled.every((r) => Number(r.rows[0].r.billed_ink) === 49.5),
      "duplicate settlement uses configured multiplier once",
    );
    check(
      Number(
        (
          await pool.query(
            "select ink_balance from ink_balances where user_id=$1",
            [user],
          )
        ).rows[0].ink_balance,
      ) === 950.5,
      "wallet charged exactly once",
    );
    check(
      (
        await pool.query("select count(*) from ink_usage where user_id=$1", [
          user,
        ])
      ).rows[0].count === "1",
      "one settlement receipt",
    );
    const fail = (await begin("failed")).rows[0].r.call.id;
    await pool.query("select pr_observe_ai_call($1,$2,$3,$4,$5,$6,$7)", [
      fail,
      "failed-response",
      "request",
      0.2,
      {},
      null,
      "refusal",
    ]);
    await pool.query("select pr_settle_ai_call($1)", [fail]);
    check(
      Number(
        (
          await pool.query(
            "select vendor_usd,billed_ink from pr_ai_calls where id=$1",
            [fail],
          )
        ).rows[0].billed_ink,
      ) === 0,
      "paid failure records expense without charging author",
    );
    const unknown = (await begin("ambiguous")).rows[0].r.call.id;
    await pool.query(
      "update pr_ai_calls set state='reconciliation' where id=$1",
      [unknown],
    );
    check(
      (await begin("ambiguous")).rows[0].r.existing,
      "unknown usage cannot launch a replacement paid call",
    );
    await assert.rejects(begin("too-expensive", 99), /Insufficient/);
    checks++;
    const claimArgs = [run, chapter, "draft", user];
    const jobs = await Promise.all([
      pool.query("select pr_claim_step($1,$2,$3,$4) as r", claimArgs),
      pool.query("select pr_claim_step($1,$2,$3,$4) as r", claimArgs),
    ]);
    check(
      jobs.filter((r) => !r.rows[0].r.existing).length === 1,
      "one chapter worker wins",
    );
    const commitArgs = [
      run,
      chapter,
      user,
      "draft",
      0,
      "A truthful fixture chapter.",
      {},
      { beat_plan: [], usage: {} },
      { wordCount: 4 },
    ];
    await pool.query(
      "select pr_commit_step($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      commitArgs,
    );
    await pool.query(
      "select pr_commit_step($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      commitArgs,
    );
    check(
      (
        await pool.query(
          "select count(*) from chapter_contents where chapter_id=$1",
          [chapter],
        )
      ).rows[0].count === "1",
      "replayed commit cannot duplicate a chapter version",
    );
    await pool.query("select pr_claim_step($1,$2,'revise',$3)", [
      run,
      chapter,
      user,
    ]);
    await pool.query(
      "insert into chapter_contents(chapter_id,content,version) values($1,'Author correction',2)",
      [chapter],
    );
    await assert.rejects(
      pool.query("select pr_commit_step($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
        run,
        chapter,
        user,
        "revise",
        1,
        "Stale revision",
        {},
        {},
        {},
      ]),
      /Chapter changed/,
    );
    checks++;
    check(
      (
        await pool.query(
          "select content from chapter_contents where chapter_id=$1 order by version desc limit 1",
          [chapter],
        )
      ).rows[0].content === "Author correction",
      "author edits survive a stale result",
    );
    await assert.rejects(
      pool.query("select pr_claim_step($1,$2,$3,$4)", [
        run,
        chapter,
        "final",
        randomUUID(),
      ]),
      /unavailable/,
    );
    checks++;
    await pool.query(
      "insert into theo_live_workers(id) values('fixture-worker')",
    );
    const reserve = () =>
      pool.query("select theo_live_reserve($1,$2,$3,$4,$5) as id", [
        user,
        run,
        "v=fixture",
        { pro: 5200, premium: 15600 },
        0.05,
      ]);
    const voices = await Promise.allSettled([reserve(), reserve()]);
    check(
      voices.filter((v) => v.status === "fulfilled").length === 1,
      "duplicate voice sessions cannot share an allowance",
    );
    const sid = voices.find(
      (v) => v.status === "fulfilled",
    )! as PromiseFulfilledResult<pg.QueryResult>;
    const session = sid.value.rows[0].id;
    await pool.query("select theo_live_observe($1,$2,$3,$4,$5,$6)", [
      session,
      "u1",
      "session.usage.updated",
      {},
      20,
      false,
    ]);
    await pool.query("select theo_live_observe($1,$2,$3,$4,$5,$6)", [
      session,
      "u1",
      "session.usage.updated",
      {},
      20,
      false,
    ]);
    await pool.query("select theo_live_observe($1,$2,$3,$4,$5,$6)", [
      session,
      "u2",
      "session.usage.updated",
      {},
      30,
      false,
    ]);
    await pool.query("select theo_live_observe($1,$2,$3,$4,$5,$6)", [
      session,
      "end",
      "session.closed",
      {},
      35,
      true,
    ]);
    const voice = (
      await pool.query("select * from theo_live_sessions where id=$1", [
        session,
      ])
    ).rows[0];
    check(
      Number(voice.used_seconds) === 35,
      "cumulative Live usage is not summed",
    );
    check(
      Math.abs(Number(voice.vendor_usd) - (35 * 0.05) / 60) < 1e-9,
      "Live cost uses final seconds",
    );
    check(
      Number(
        (
          await pool.query(
            "select ink_balance from ink_balances where user_id=$1",
            [user],
          )
        ).rows[0].ink_balance,
      ) === 950.5,
      "Live duration never debits Ink",
    );
    const late = await pool.query(
      "select theo_live_observe($1,'late','session.usage.updated','{}',99,false) as fresh",
      [session],
    );
    check(
      late.rows[0].fresh === false,
      "late events cannot reopen a finalized voice session",
    );
    const question = randomUUID(),
      answer = randomUUID();
    await pool.query(
      "insert into pr_questions(id,run_id,chapter_id,user_id,question,why,impact) values($1,$2,$3,$4,'Why?','Fixture',1)",
      [question, run, chapter, user],
    );
    await pool.query(
      "insert into pr_answers(id,question_id,run_id,user_id,transcript,source,source_event_key) values($1,$2,$3,$4,'Original words','voice',$5)",
      [answer, question, run, user, session + ":fixture-answer"],
    );
    await assert.rejects(
      pool.query("select theo_correct_answer($1,$2,$3,'Changed')", [
        session,
        randomUUID(),
        answer,
      ]),
      /End voice/,
    );
    checks++;
    await pool.query("select theo_correct_answer($1,$2,$3,'Corrected words')", [
      session,
      user,
      answer,
    ]);
    const corrected = await pool.query(
      "select a.transcript,e.payload from pr_answers a join theo_live_events e on e.session_id=$2 and e.event_type='author.correction' where a.id=$1",
      [answer, session],
    );
    check(
      corrected.rows[0].transcript === "Corrected words" &&
        corrected.rows[0].payload.before === "Original words",
      "author correction preserves original source in its audit record",
    );
    await pool.query("update pr_runs set status='revising' where id=$1", [run]);
    await assert.rejects(
      pool.query("select theo_correct_answer($1,$2,$3,'Too late')", [
        session,
        user,
        answer,
      ]),
      /no longer editable/,
    );
    checks++;
    await pool.query("update pr_runs set status='interviewing' where id=$1", [
      run,
    ]);
    const next = (await reserve()).rows[0].id;
    await assert.rejects(
      pool.query(
        "select theo_live_observe($1,'negative','session.usage.updated','{}',-1,false)",
        [next],
      ),
      /Nonmonotonic/,
    );
    checks++;
    await assert.rejects(
      pool.query(
        "select theo_live_observe($1,'missing-final','session.closed','{}',null,true)",
        [next],
      ),
      /Final usage required/,
    );
    checks++;
    const rejected = await pool.query(
      "select count(*) from theo_live_events where session_id=$1",
      [next],
    );
    check(
      rejected.rows[0].count === "0",
      "rejected usage events roll back atomically",
    );
    check(
      Number(
        (
          await pool.query(
            "select reserved_seconds from theo_live_sessions where id=$1",
            [next],
          )
        ).rows[0].reserved_seconds,
      ) === 5165,
      "unused seconds released only after finalization",
    );
    await pool.query(
      "update theo_live_sessions set state='closed' where id=$1",
      [next],
    );
    await pool.query(
      "update ink_balances set tier='starter' where user_id=$1",
      [user],
    );
    await assert.rejects(reserve(), /unavailable for this plan/);
    checks++;
    const privileges = await pool.query(
      "select has_function_privilege('authenticated','pr_settle_ai_call(uuid)','execute') as wallet, has_table_privilege('authenticated','theo_live_events','select') as transcripts",
    );
    check(
      !privileges.rows[0].wallet && !privileges.rows[0].transcripts,
      "client roles cannot settle or read raw voice events",
    );
    await pool.query("update ink_balances set tier='pro' where user_id=$1", [
      user,
    ]);
    await pool.query("update pr_runs set models='{}' where id=$1", [run]);
    await assert.rejects(reserve(), /pinned OpenAI/);
    checks++;
    await pool.query(
      "update pr_runs set models=jsonb_build_object('provider','openai'),status='cancelled' where id=$1",
      [run],
    );
    await assert.rejects(begin("after-cancel"), /finished/);
    checks++;
    await assert.rejects(reserve(), /Interview run unavailable/);
    checks++;
    console.log(`${checks} database checks passed.`);
  } finally {
    await pool.end();
    await admin.query(`drop database ${name} with (force)`);
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
