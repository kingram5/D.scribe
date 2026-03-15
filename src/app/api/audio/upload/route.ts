import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// POST /api/audio/upload — upload audio file to Supabase Storage
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const projectId = formData.get("project_id") as string | null;

  if (!file || !projectId) {
    return NextResponse.json(
      { error: "file and project_id are required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

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
