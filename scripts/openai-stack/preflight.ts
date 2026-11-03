/** Read-only staging checks. Never creates provider calls, sessions or database rows. */
import { newRunConfig } from "../../src/lib/ai/config";
import { liveConfig } from "../../src/lib/theo/live-config";
import { openAIClient } from "../../src/lib/ai/openai";
import { createServerClient } from "../../src/lib/supabase";

async function main() {
  const problems: string[] = [];
  const requireValue = (key: string) => {
    if (!process.env[key]?.trim()) problems.push(`${key}: missing`);
  };
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY", "DSCRIBE_STAGING_SUPABASE_REF", "NEXT_PUBLIC_SITE_URL"])
    requireValue(key);
  if (!process.env.DSCRIBE_OPENAI_API_KEY && !process.env.OPENAI_API_KEY)
    problems.push("OpenAI server key: missing");
  if (process.env.VERCEL_ENV === "production") problems.push("Production target rejected");
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const ref = process.env.DSCRIBE_STAGING_SUPABASE_REF ?? "";
    if (!/^[a-z]{20}$/.test(ref) || url.origin !== `https://${ref}.supabase.co` ||
      url.pathname !== "/" || url.search || url.hash || url.username || url.password)
      problems.push("Supabase URL does not match the operator-confirmed staging project");
  } catch { problems.push("Supabase URL: invalid"); }
  try {
    const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
    if (site.protocol !== "https:" || site.username || site.password || site.search || site.hash)
      problems.push("Preview site must use HTTPS without credentials or query parameters");
  } catch { problems.push("Preview site URL: invalid"); }
  const cohort = (process.env.OPENAI_PR_USER_IDS ?? "").split(",").map(s => s.trim());
  if (!cohort.length || cohort.some(id => !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)))
    problems.push("OPENAI_PR_USER_IDS must contain explicit staging user UUIDs");
  if (process.env.PUBLISHER_READY_TEXT_PROVIDER !== "openai") problems.push("Text provider is not openai");
  let config: ReturnType<typeof newRunConfig> = null;
  try { config = newRunConfig(cohort[0]); if (!config) problems.push("Text routing is not enabled for the cohort"); }
  catch { problems.push("Text model/rate configuration rejected by runtime validator"); }
  let live: ReturnType<typeof liveConfig> = null;
  try { live = liveConfig(cohort[0]); if (!live) problems.push("Live staging routing is disabled"); }
  catch { problems.push("Live configuration rejected by runtime validator"); }
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
    return;
  }
  console.log("Local staging configuration passed; project isolation and current rates require operator verification.");
  if (!process.argv.includes("--remote")) return;
  const db = createServerClient();
  for (const table of ["pr_ai_calls", "pr_step_jobs", "theo_live_sessions", "theo_live_events", "theo_live_workers"]) {
    const { error } = await db.from(table).select("*", { head: true, count: "exact" }).limit(0);
    if (error) problems.push(`${table}: read failed (schema, credentials or network)`);
  }
  const { data: workers, error } = await db.from("theo_live_workers").select("heartbeat_at")
    .gte("heartbeat_at", new Date(Date.now() - 15_000).toISOString()).limit(1);
  if (error || !workers?.length) problems.push("No recent Live worker heartbeat");
  try {
    const ids = new Set((await openAIClient().models.list()).data.map(model => model.id));
    const required = new Set([...Object.values(config!.stages).map(stage => stage.model), live!.model]);
    for (const model of required) if (!ids.has(model)) problems.push(`${model}: absent from model listing`);
    console.log("OpenAI model listing checked; inference and billing remain unverified.");
  } catch { problems.push("OpenAI model listing failed (credentials or network)"); }
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exitCode = 1;
  else console.log("Read-only remote preflight passed; authenticated workflow, media, vendor closure and billing still require live validation.");
}
main().catch(() => { console.error("Staging preflight failed; inspect privately without printing credentials or provider payloads."); process.exitCode = 1; });
