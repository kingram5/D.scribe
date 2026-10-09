/** Read-only by default; explicit resume only for confirmed completed/rejected attempts. */
import { createServerClient } from "../src/lib/supabase";
const [id, action = "inspect", reason] = process.argv.slice(2);
if (
  !id ||
  !/^[-0-9a-f]{36}$/i.test(id) ||
  !["inspect", "resume", "abandon"].includes(action)
)
  throw new Error(
    "Usage: tsx scripts/reconcile-mixed.ts OPERATION_UUID [inspect|resume|abandon] [evidence]",
  );
const db = createServerClient();
async function main() {
  const { data: operation, error } = await db
    .from("ai_operations")
    .select("id,state,operation_key,reservation_id,created_at,reconciliation")
    .eq("id", id)
    .single();
  if (error) throw error;
  const { data: attempts, error: ae } = await db
    .from("ai_attempts")
    .select(
      "id,call_key,ordinal,provider,model,state,provider_request_id,vendor_cost_usd,usage",
    )
    .eq("operation_id", id);
  if (ae) throw ae;
  // Never dump source, prompts or result bodies.
  console.log(JSON.stringify({ operation, attempts }, null, 2));
  if (action !== "inspect") {
    if (!reason)
      throw new Error(
        "Provide reconciliation evidence without private source text",
      );
    const { error } = await db.rpc(
      action === "resume"
        ? "reopen_mixed_operation"
        : "abandon_mixed_operation",
      { p_operation_id: id, p_reason: reason },
    );
    if (error) throw error;
    console.log(
      action === "resume"
        ? "Operation unlocked for resume with pinned routes/checkpoints."
        : "Reservation released; vendor attempts retained; no customer charge.",
    );
  }
}
main().catch(() => {
  console.error("Inspection/resume failed; no provider request was sent.");
  process.exitCode = 1;
});
