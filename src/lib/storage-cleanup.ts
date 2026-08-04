import { createServerClient } from "@/lib/supabase";
import { deleteFile } from "@/lib/r2";
import { logger } from "@/lib/logger";

export interface AudioCleanupResult {
  attempted: number;
  failed: number;
  failedKeys: string[];
}

/**
 * Deletion of every R2 audio object belonging to the given projects. Used by
 * project delete + full account deletion so R2 files aren't orphaned (DB rows
 * cascade, but storage objects don't). Per-file failures are logged, skipped,
 * and REPORTED in the result so callers about to drop the rows that hold these
 * keys can refuse to proceed. Throws if the keys can't even be enumerated.
 */
export async function deleteAudioForProjects(projectIds: string[]): Promise<AudioCleanupResult> {
  const result: AudioCleanupResult = { attempted: 0, failed: 0, failedKeys: [] };
  if (projectIds.length === 0) return result;
  const supabase = createServerClient();

  // NOTE: the R2 key lives in audio_uploads.file_path (there is no r2_key
  // column). This function used to select "r2_key", swallow the resulting
  // PostgREST error, and iterate an empty list — cleanup was a silent no-op
  // from the day it was written.
  const { data: uploads, error } = await supabase
    .from("audio_uploads")
    .select("file_path")
    .in("project_id", projectIds);
  if (error) {
    // Can't enumerate the keys — the caller must not go on to delete the rows
    // that record them, or the objects are orphaned with no way back.
    throw new Error(`audio_uploads lookup failed: ${error.message}`);
  }

  for (const u of uploads ?? []) {
    if (!u.file_path) continue;
    result.attempted++;
    try {
      await deleteFile(u.file_path);
    } catch (err) {
      result.failed++;
      result.failedKeys.push(u.file_path);
      logger.error("Failed to delete R2 audio file", {
        meta: { r2_key: u.file_path },
        error: err,
      });
    }
  }
  return result;
}
