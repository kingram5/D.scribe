import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { computeEditDelta } from "@/lib/edit-diff";
import { bumpEditCounter } from "@/lib/style-memory";
import { logger } from "@/lib/logger";

// GET /api/chapter-content/[chapterId] — get latest content for a chapter
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { chapterId } = await params;
  const supabase = createServerClient();

  // Verify the chapter's project belongs to this user
  const { data: chapter } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", chapterId)
    .single();

  if (!chapter) {
    return NextResponse.json({ content: "", word_count: 0, version: 0 });
  }

  const { data: projectOwner } = await supabase
    .from("projects")
    .select("id")
    .eq("id", chapter.project_id)
    .eq("user_id", user.id)
    .single();

  if (!projectOwner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("chapter_contents")
    .select("*")
    .eq("chapter_id", chapterId)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ content: "", word_count: 0, version: 0 });
  }

  return NextResponse.json(data);
}

// PATCH /api/chapter-content/[chapterId] — save edited content as new version
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { chapterId } = await params;
  const { content } = await req.json();
  const supabase = createServerClient();

  // Verify the chapter's project belongs to this user
  const { data: chapter } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", chapterId)
    .single();

  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  const { data: projectOwner } = await supabase
    .from("projects")
    .select("id")
    .eq("id", chapter.project_id)
    .eq("user_id", user.id)
    .single();

  if (!projectOwner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get current latest version (content included for the editorial-memory diff)
  const { data: existing } = await supabase
    .from("chapter_contents")
    .select("version, content, generation_params")
    .eq("chapter_id", chapterId)
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion = (existing?.[0]?.version || 0) + 1;
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  const { data, error } = await supabase
    .from("chapter_contents")
    .insert({
      chapter_id: chapterId,
      content,
      word_count: wordCount,
      generation_params: { manual_edit: true },
      version: nextVersion,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mark chapter as edited
  await supabase
    .from("chapters")
    .update({ status: "edited" })
    .eq("id", chapterId);

  // Editorial memory: diff generated → edited on the first manual save after a
  // generation. Never blocks the save — capture failures only log.
  let needsDistill = false;
  const prev = existing?.[0];
  if (prev && !prev.generation_params?.manual_edit && prev.content !== content) {
    try {
      const delta = computeEditDelta(prev.content, content);
      if (delta.stats.sentences_changed > 0) {
        await supabase.from("style_deltas").insert({
          user_id: user.id,
          project_id: chapter.project_id,
          chapter_id: chapterId,
          from_version: prev.version,
          to_version: nextVersion,
          delta,
        });
        needsDistill = await bumpEditCounter(user.id);
      }
    } catch (err) {
      logger.error("Editorial memory capture failed", {
        route: "/api/chapter-content",
        userId: user.id,
        error: err,
      });
    }
  }

  // needs_distill tells the client to fire POST /api/voice-memory in the
  // background (client-triggered so the save response stays fast on Vercel).
  return NextResponse.json({ ...data, needs_distill: needsDistill });
}
