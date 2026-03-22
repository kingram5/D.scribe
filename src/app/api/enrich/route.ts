import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { askClaude, cleanJson } from "@/lib/claude";
import { ENRICH_SYSTEM, enrichPrompt } from "@/lib/prompts/enrich";
import { requireAuth } from "@/lib/auth";

// POST /api/enrich — find enrichment quotes for a chapter
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { chapter_id } = await req.json();
  if (!chapter_id) {
    return NextResponse.json({ error: "chapter_id required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Get chapter + project
  const { data: chapter } = await supabase
    .from("chapters")
    .select("*, projects(*)")
    .eq("id", chapter_id)
    .single();

  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  // Verify the chapter's project belongs to this user
  if (chapter.projects?.user_id !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get key points for this chapter
  const { data: keyPoints } = await supabase
    .from("key_points")
    .select("title")
    .in("id", chapter.key_point_ids || []);

  const raw = await askClaude(
    ENRICH_SYSTEM,
    enrichPrompt(
      chapter.title,
      chapter.summary,
      (keyPoints || []).map((kp) => kp.title),
      chapter.projects.audience
    ),
    { temperature: 0.4 }
  );

  try {
    const items = JSON.parse(cleanJson(raw));

    // Delete existing enrichments for this chapter
    await supabase.from("enrichments").delete().eq("chapter_id", chapter_id);

    // Insert new ones
    const { data: enrichments, error } = await supabase
      .from("enrichments")
      .insert(
        items.map((item: Record<string, unknown>) => ({
          chapter_id,
          quote_text: item.quote_text,
          source_author: item.source_author,
          source_title: item.source_title,
          source_type: item.source_type,
          relevance_note: item.relevance_note,
          included: true,
        }))
      )
      .select();

    if (error) throw error;
    return NextResponse.json(enrichments);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enrichment failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/enrich — toggle enrichment inclusion
export async function PATCH(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { id, included } = await req.json();
  const supabase = createServerClient();

  // Verify the enrichment belongs to a chapter owned by this user
  const { data: enrichment } = await supabase
    .from("enrichments")
    .select("chapter_id, chapters(project_id, projects(user_id))")
    .eq("id", id)
    .single();

  if (!enrichment) {
    return NextResponse.json({ error: "Enrichment not found" }, { status: 404 });
  }

  const projectUserId = (enrichment as unknown as {
    chapters: { projects: { user_id: string } };
  }).chapters?.projects?.user_id;

  if (projectUserId !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("enrichments")
    .update({ included })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
