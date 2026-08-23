import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { isOutlineChapterMutation, markStructureEdited } from "@/lib/structure-provenance";

// GET /api/project/[id] — get single project with all related data
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const supabase = createServerClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
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

// PATCH /api/project/[id] — update project or chapter
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const body = await req.json();
  const supabase = createServerClient();

  // Verify project ownership before any mutation
  const { data: projectOwner } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!projectOwner) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // If chapter_id is provided, update the chapter
  if (body.chapter_id) {
    const { chapter_id, ...updates } = body;

    const { data: existing } = await supabase
      .from("chapters")
      .select("id, title, summary, sort_order, chapter_number")
      .eq("id", chapter_id)
      .eq("project_id", id)
      .maybeSingle();

    if (!existing) {
      // Outline ADD_CHAPTER mints a client UUID and PATCHes it. Persist the
      // new row — that is a user add, so the outline is no longer AI-accepted.
      const { data, error } = await supabase
        .from("chapters")
        .insert({
          id: chapter_id,
          project_id: id,
          title: typeof updates.title === "string" ? updates.title : "New Chapter",
          summary: typeof updates.summary === "string" ? updates.summary : "",
          key_point_ids: updates.key_point_ids ?? [],
          blended_key_point_ids: updates.blended_key_point_ids,
          target_word_count: updates.target_word_count ?? 3000,
          status: updates.status ?? "outlined",
          sort_order: updates.sort_order ?? 0,
          chapter_number: updates.chapter_number ?? 1,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await markStructureEdited(id);
      return NextResponse.json(data);
    }

    const { data, error } = await supabase
      .from("chapters")
      .update(updates)
      .eq("id", chapter_id)
      .eq("project_id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (isOutlineChapterMutation(existing, updates)) {
      await markStructureEdited(id);
    }
    return NextResponse.json(data);
  }

  // If key_point_id is provided, update the key point
  if (body.key_point_id) {
    const { key_point_id, ...updates } = body;
    const { data, error } = await supabase
      .from("key_points")
      .update(updates)
      .eq("id", key_point_id)
      .eq("project_id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // If delete_key_point_id is provided, delete the key point and clean up chapter references
  if (body.delete_key_point_id) {
    const kpId = body.delete_key_point_id;
    // Remove from all chapters' key_point_ids
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id, key_point_ids, blended_key_point_ids")
      .eq("project_id", id);
    if (chapters) {
      for (const ch of chapters) {
        const kpIds = (ch.key_point_ids || []).filter((kid: string) => kid !== kpId);
        const blended = (ch.blended_key_point_ids || []).filter((kid: string) => kid !== kpId);
        if (kpIds.length !== (ch.key_point_ids || []).length) {
          await supabase.from("chapters").update({ key_point_ids: kpIds, blended_key_point_ids: blended }).eq("id", ch.id);
        }
      }
    }
    const { error } = await supabase.from("key_points").delete().eq("id", kpId).eq("project_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
  }

  // If delete_chapter_id is provided, delete chapter and renumber
  if (body.delete_chapter_id) {
    const chId = body.delete_chapter_id;
    const { error } = await supabase.from("chapters").delete().eq("id", chId).eq("project_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await markStructureEdited(id);
    // Renumber remaining chapters
    const { data: remaining } = await supabase
      .from("chapters")
      .select("id")
      .eq("project_id", id)
      .order("sort_order");
    if (remaining) {
      for (let i = 0; i < remaining.length; i++) {
        await supabase.from("chapters").update({ chapter_number: i + 1, sort_order: i }).eq("id", remaining[i].id);
      }
    }
    return NextResponse.json({ deleted: true });
  }

  // If transcript_id is provided, update the transcript
  if (body.transcript_id) {
    const { transcript_id, ...updates } = body;
    const { data, error } = await supabase
      .from("transcripts")
      .update(updates)
      .eq("id", transcript_id)
      .eq("project_id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Allowlist: only permit safe fields for project updates
  const ALLOWED_FIELDS = ["title", "description", "audience", "num_chapters", "target_words_per_chapter", "status", "is_public", "published_excerpt", "published_author"];
  const filteredBody: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) filteredBody[key] = body[key];
  }

  const { data, error } = await supabase
    .from("projects")
    .update(filteredBody)
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
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const supabase = createServerClient();

  // Verify ownership before deletion
  const { data: projectOwner } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!projectOwner) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
