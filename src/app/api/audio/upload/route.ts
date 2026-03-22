import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  // Some browsers/OS report these variants — accept them too
  "audio/x-wav",
  "audio/x-m4a",
  "audio/mp3",
]);

// POST /api/audio/upload — upload audio file to Supabase Storage
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const projectId = formData.get("project_id") as string | null;

  if (!file || !projectId) {
    return NextResponse.json(
      { error: "file and project_id are required" },
      { status: 400 }
    );
  }

  // Validate MIME type BEFORE reading the body into memory
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        error: `Unsupported file type: ${file.type}. Allowed types: audio/mpeg, audio/wav, audio/mp4, audio/ogg, audio/webm`,
      },
      { status: 400 }
    );
  }

  // Validate file size BEFORE calling arrayBuffer() to avoid loading huge files into memory
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: `File too large. Maximum size is 500 MB (received ${(file.size / 1024 / 1024).toFixed(1)} MB)`,
      },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Verify the project belongs to this user
  const { data: projectOwner } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!projectOwner) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Upload to Supabase Storage
  const fileName = `${projectId}/${Date.now()}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("audio")
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Create DB record
  const { data, error } = await supabase
    .from("audio_uploads")
    .insert({
      project_id: projectId,
      file_path: fileName,
      file_name: file.name,
      file_size_bytes: file.size,
      status: "uploaded",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
