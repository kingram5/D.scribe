import { createServerClient } from "@/lib/supabase";
import { deleteFile } from "@/lib/r2";
import { logger } from "@/lib/logger";

/**
 * Best-effort deletion of every R2 audio object belonging to the given projects.
 * Used by project delete + full account deletion so R2 files aren't orphaned
 * (DB rows cascade, but storage objects don't). Per-file failures are logged and
 * skipped so one bad object doesn't block the rest.
 */
export async function deleteAudioForProjects(projectIds: string[]): Promise<void> {
  if (projectIds.length === 0) return;
  const supabase = createServerClient();

  const { data: uploads } = await supabase
    .from("audio_uploads")
    .select("r2_key")
    .in("project_id", projectIds);

  for (const u of uploads ?? []) {
    if (!u.r2_key) continue;
    try {
      await deleteFile(u.r2_key);
    } catch (err) {
      logger.error("Failed to delete R2 audio file", {
        meta: { r2_key: u.r2_key },
        error: err,
      });
    }
  }
}
