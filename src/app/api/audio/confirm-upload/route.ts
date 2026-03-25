import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

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
    .select("id, project_id, status")
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
