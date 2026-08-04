import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { getUploadUrl } from "@/lib/r2";

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "audio/x-wav",
  "audio/x-m4a",
  "audio/mp3",
  "video/webm",
  "video/mp4",
  "application/octet-stream",
]);

// POST /api/audio/upload-url — get a presigned R2 URL for direct upload
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const body = await req.json();
  const { project_id, file_name, file_size, content_type } = body;

  if (!project_id || !file_name || !file_size || !content_type) {
    return NextResponse.json(
      { error: "project_id, file_name, file_size, and content_type are required" },
      { status: 400 }
    );
  }

  // Validate MIME type (strip codec params like ";codecs=opus" before checking)
  const baseMime = content_type.split(";")[0].trim();
  if (!ALLOWED_MIME_TYPES.has(baseMime)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${content_type}` },
      { status: 400 }
    );
  }

  // Validate file size
  if (file_size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File too large. Maximum size is 500 MB (received ${(file_size / 1024 / 1024).toFixed(1)} MB)` },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Verify project ownership
  const { data: projectOwner } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!projectOwner) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Generate R2 key and presigned URL. file_name is client input — slugify it
  // for the key (".." segments collapse during URL normalisation and NUL bytes
  // survive, landing the object at a different key than the file_path row and
  // orphaning it for transcription AND deletion). The display name keeps its
  // original form in the file_name column.
  const safeName =
    file_name
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .replace(/\.{2,}/g, ".")
      .replace(/^[._-]+/, "")
      .slice(-100) || "audio";
  const r2Key = `${project_id}/${Date.now()}-${safeName}`;

  try {
    const uploadUrl = await getUploadUrl(r2Key, content_type, file_size);

    // Create DB record — use "uploaded" status to satisfy check constraint
    const { data, error } = await supabase
      .from("audio_uploads")
      .insert({
        project_id,
        file_path: r2Key,
        file_name,
        file_size_bytes: file_size,
        status: "uploaded",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      upload_url: uploadUrl,
      r2_key: r2Key,
      upload_id: data.id,
      // Content-Type is now part of the presigned signature: the client MUST
      // PUT with exactly this value or R2 rejects the signature. Mobile
      // browsers often report file.type as "" — echoing the validated value
      // back keeps the client and the signature in agreement.
      content_type,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to generate upload URL: ${message}` }, { status: 500 });
  }
}
