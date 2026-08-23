import { createServerClient } from "@/lib/supabase";

const OUTLINE_FIELDS = ["title", "summary", "sort_order", "chapter_number"] as const;

/**
 * Flip projects.structure_provenance to ai_edited exactly once.
 * Never downgrades user_authored or already-edited outlines back to
 * ai_generated_accepted — the filter is the guard.
 */
export async function markStructureEdited(projectId: string): Promise<void> {
  const supabase = createServerClient();
  await supabase
    .from("projects")
    .update({ structure_provenance: "ai_edited" })
    .eq("id", projectId)
    .eq("structure_provenance", "ai_generated_accepted");
}

/** True when a chapter PATCH actually changed title/summary/order. */
export function isOutlineChapterMutation(
  before: { title?: string; summary?: string; sort_order?: number; chapter_number?: number } | null,
  updates: Record<string, unknown>
): boolean {
  if (!before) return false;
  return OUTLINE_FIELDS.some((field) => field in updates && updates[field] !== before[field]);
}
