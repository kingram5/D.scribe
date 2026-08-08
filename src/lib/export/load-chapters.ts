import { createServerClient } from "@/lib/supabase";
import { Chapter, ChapterContent } from "@/types";

export type ChapterWithContent = Chapter & { content: ChapterContent };

/** Ownership-checked load of a project's chapters with their latest content.
 *  Shared by /api/export (PDF/DOCX download) and /api/export/drive.
 *  Returns null when the project doesn't belong to the user. */
export async function loadProjectForExport(projectId: string, userId: string) {
  const supabase = createServerClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();
  if (!project) return null;

  const { data: chapters } = await supabase
    .from("chapters")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order");
  if (!chapters?.length) return { project, ready: [] as ChapterWithContent[] };

  // Latest content per chapter — batched so a 60-chapter book fires at most 8
  // concurrent queries instead of 60 at once.
  const withContent: ChapterWithContent[] = [];
  const BATCH = 8;
  for (let i = 0; i < chapters.length; i += BATCH) {
    const batch = await Promise.all(
      chapters.slice(i, i + BATCH).map(async (ch) => {
        const { data: content } = await supabase
          .from("chapter_contents")
          .select("*")
          .eq("chapter_id", ch.id)
          .order("version", { ascending: false })
          .limit(1)
          .single();
        return { ...ch, content: content || { content: "", word_count: 0 } } as ChapterWithContent;
      })
    );
    withContent.push(...batch);
  }

  return { project, ready: withContent.filter((ch) => ch.content.content) };
}
