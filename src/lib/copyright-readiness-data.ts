import { createServerClient } from "@/lib/supabase";
import {
  scoreBook,
  scoreChapter,
  type BookReadiness,
  type ChapterReadiness,
  type EditEventLite,
} from "@/lib/copyright-readiness";

export interface ReadinessLoad {
  projectId: string;
  title: string;
  readiness: BookReadiness;
  editTotals: {
    events: number;
    substantive: number;
    cosmetic: number;
  };
}

/** Ownership-checked load + score. Returns null when the project is not the user's. */
export async function loadBookReadiness(
  projectId: string,
  userId: string
): Promise<ReadinessLoad | null> {
  const supabase = createServerClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, structure_provenance")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();
  if (!project) return null;

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, chapter_number, title, status")
    .eq("project_id", projectId)
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

  const readiness = scoreBook(
    scored,
    project.structure_provenance ?? "ai_generated_accepted",
    unscored
  );

  return {
    projectId: project.id,
    title: project.title ?? "Untitled",
    readiness,
    editTotals: {
      events: readiness.chapters.reduce(
        (n, c) => n + c.substantiveEdits + c.cosmeticEdits,
        0
      ),
      substantive: readiness.chapters.reduce((n, c) => n + c.substantiveEdits, 0),
      cosmetic: readiness.chapters.reduce((n, c) => n + c.cosmeticEdits, 0),
    },
  };
}
