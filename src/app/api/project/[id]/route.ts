import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// GET /api/project/[id] — get single project with all related data
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  // Fetch related data in parallel
  const [audioRes, transcriptRes, keyPointsRes, chaptersRes, nodesRes, edgesRes] = await Promise.all([
    supabase.from("audio_uploads").select("*").eq("project_id", id).order("created_at"),
    supabase.from("transcripts").select("*").eq("project_id", id).order("created_at"),
    supabase.from("key_points").select("*").eq("project_id", id).order("created_at"),
    supabase.from("chapters").select("*").eq("project_id", id).order("sort_order"),
    supabase.from("mind_map_nodes").select("*").eq("project_id", id),
    supabase.from("mind_map_edges").select("*").eq("project_id", id),
  ]);

  return NextResponse.json({
    ...project,
    audio_uploads: audioRes.data || [],
    transcripts: transcriptRes.data || [],
    key_points: keyPointsRes.data || [],
    chapters: chaptersRes.data || [],
    mind_map_nodes: nodesRes.data || [],
    mind_map_edges: edgesRes.data || [],
  });
}

// PATCH /api/project/[id] — update project
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("projects")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/project/[id] — delete project (cascades)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
