import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import {
  scoreBook,
  scoreChapter,
  type ChapterReadiness,
  type EditEventLite,
} from "@/lib/copyright-readiness";

// POST /api/copyright-readiness — book-level authorship bands.
// Fully deterministic (no model call, no Ink). Uncached in v1.
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { project_id } = await req.json();
  if (!project_id) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, structure_provenance")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();
  if (!project) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, chapter_number, title, status")
    .eq("project_id", project_id)
    .order("sort_order");

  const list = chapters ?? [];
  const chapterIds = list.map((ch) => ch.id);

  const contentsByChapter = new Map<string, { content: string; version: number }[]>();
  const eventsByChapter = new Map<string, EditEventLite[]>();

  if (chapterIds.length > 0) {
    const [{ data: contents }, { data: events }] = await Promise.all([
      supabase
        .from("chapter_contents")
        .select("chapter_id, content, version")
        .in("chapter_id", chapterIds)
        .order("version", { ascending: true }),
      supabase
        .from("edit_events")
        .select("chapter_id, before_text, after_text, kind")
        .in("chapter_id", chapterIds),
    ]);

    for (const row of contents ?? []) {
      const arr = contentsByChapter.get(row.chapter_id) ?? [];
      arr.push({ content: row.content ?? "", version: row.version });
      contentsByChapter.set(row.chapter_id, arr);
    }
    for (const row of events ?? []) {
      const arr = eventsByChapter.get(row.chapter_id) ?? [];
      arr.push({
        before_text: row.before_text ?? "",
        after_text: row.after_text ?? "",
        kind: row.kind,
      });
      eventsByChapter.set(row.chapter_id, arr);
    }
  }

  const scored: ChapterReadiness[] = [];
  const unscored: number[] = [];

  for (const ch of list) {
    if (ch.status === "outlined" || ch.status === "generating") {
      unscored.push(ch.chapter_number);
      continue;
    }
    const versions = contentsByChapter.get(ch.id) ?? [];
    if (versions.length === 0) {
      unscored.push(ch.chapter_number);
      continue;
    }
    const first = versions.find((v) => v.version === 1) ?? versions[0];
    const latest = versions[versions.length - 1];
    scored.push(
      scoreChapter(first.content, latest.content, eventsByChapter.get(ch.id) ?? [], {
        chapterId: ch.id,
        chapterNumber: ch.chapter_number,
        title: ch.title,
      })
    );
  }

  return NextResponse.json(
    scoreBook(scored, project.structure_provenance ?? "ai_generated_accepted", unscored)
  );
}
