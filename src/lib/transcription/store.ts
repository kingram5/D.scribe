import { createServerClient } from "@/lib/supabase";
import { AIError } from "@/lib/ai/contracts";
import { reserveInk, inkPerAudioMinute } from "@/lib/ink";
import { transcribeGroq, groqVendorCost } from "./groq";
export async function groqUpload(
  actorId: string,
  upload: { id: string; project_id: string },
  buffer: Buffer,
  mime: string,
) {
  const db = createServerClient();
  let price: {
    version: string;
    verifiedAt: string;
    source: string;
    usdPerHour: number;
  };
  try {
    price = JSON.parse(process.env.GROQ_VERIFIED_PRICE_JSON ?? "");
  } catch {
    throw new AIError("configuration", "Verified Groq price is required");
  }
  if (
    !price.version ||
    !price.source?.startsWith("https://") ||
    !Number.isFinite(Date.parse(price.verifiedAt)) ||
    !Number.isFinite(price.usdPerHour) ||
    price.usdPerHour < 0
  )
    throw new AIError("configuration", "Invalid Groq price");
  const hold = await reserveInk(actorId, "transcribe");
  if (!hold.allowed || !hold.reservationId)
    throw new AIError("review_needed", "Insufficient Ink for transcription");
  const { error: claim } = await db.from("groq_transcription_attempts").insert({
    upload_id: upload.id,
    user_id: actorId,
    project_id: upload.project_id,
    reservation_id: hold.reservationId,
    price,
  });
  if (claim) {
    // No vendor request has started: release this losing reservation only.
    const { releaseInkReservation } = await import("@/lib/ink");
    await releaseInkReservation(hold.reservationId);
    throw new AIError(
      "review_needed",
      "Transcription already exists or needs reconciliation",
    );
  }
  try {
    const output = await transcribeGroq(buffer, mime);
    const cost = groqVendorCost(output.rawUsage.duration, price.usdPerHour);
    const { error } = await db
      .from("groq_transcription_attempts")
      .update({
        state: "reported",
        result: output.transcript,
        provider_request_id: output.requestId,
        usage: output.rawUsage,
        vendor_cost_usd: cost,
      })
      .eq("upload_id", upload.id);
    if (error) throw error;
    const { data, error: finish } = await db.rpc("finish_groq_transcription", {
      p_user_id: actorId,
      p_upload_id: upload.id,
      p_ink:
        Math.max(1, Math.ceil(output.transcript.duration_seconds / 60)) *
        inkPerAudioMinute(),
    });
    if (finish) throw finish;
    return data;
  } catch {
    await db
      .from("groq_transcription_attempts")
      .update({ state: "review_needed" })
      .eq("upload_id", upload.id)
      .neq("state", "complete");
    throw new AIError(
      "reconcile",
      "Transcription result/usage needs reconciliation before retry",
    );
  }
}
