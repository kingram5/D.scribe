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

  const { data: uploads, error } = await supabase
    .from("audio_uploads")
    .select("r2_key")
    .in("project_id", projectIds);
  if (error) {
    // Can't enumerate the keys — the caller must not go on to delete the rows
    // that record them, or the objects are orphaned with no way back.
    throw new Error(`audio_uploads lookup failed: ${error.message}`);
  }

  for (const u of uploads ?? []) {
    if (!u.r2_key) continue;
    result.attempted++;
    try {
      await deleteFile(u.r2_key);
    } catch (err) {
      result.failed++;
      result.failedKeys.push(u.r2_key);
      logger.error("Failed to delete R2 audio file", {
        meta: { r2_key: u.r2_key },
        error: err,
      });
    }
  }
  return result;
}
