import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { headObject } from "@/lib/r2";
import { logger } from "@/lib/logger";

// POST /api/audio/confirm-upload — mark an upload as completed after direct R2 upload
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { upload_id } = await req.json();

  if (!upload_id) {
    return NextResponse.json({ error: "upload_id is required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Verify the upload belongs to a project owned by this user
  const { data: upload, error: fetchError } = await supabase
    .from("audio_uploads")
    .select("id, project_id, status, file_path, file_size_bytes")
    .eq("id", upload_id)
    .single();

  if (fetchError || !upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", upload.project_id)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Ask R2 whether the object actually exists before recording "uploaded" —
  // the row used to be a record of the client's intentions, not of facts.
  try {
    const head = await headObject(upload.file_path);
    if (!head.exists) {
      return NextResponse.json(
        { error: "Upload not found in storage — the transfer may not have completed" },
        { status: 400 }
      );
    }
    // Reconcile the size the client claimed at presign time with reality.
    if (head.sizeBytes != null && head.sizeBytes !== upload.file_size_bytes) {
      await supabase
        .from("audio_uploads")
        .update({ file_size_bytes: head.sizeBytes })
        .eq("id", upload_id);
    }
  } catch (err) {
    // R2 unreachable — confirm anyway (the old behaviour) rather than strand
    // a real upload, but say so in the logs.
    logger.error("confirm-upload: HEAD check failed — confirming unverified", {
      route: "/api/audio/confirm-upload",
      userId: user.id,
      meta: { upload_id },
      error: err,
    });
  }

  // Update status to uploaded
  const { data, error } = await supabase
    .from("audio_uploads")
    .update({ status: "uploaded" })
    .eq("id", upload_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
