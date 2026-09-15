// Server-only data for the public landing page (/). Fetched in src/app/page.tsx
// and handed to the client landing component through LandingDataProvider.

import { createServerClient } from "@/lib/supabase";
import { FOUNDER } from "@/lib/founder";
import type { LandingData } from "@/components/landing/LandingDataContext";

/**
 * Books generated so far: projects (not erased) with at least one chapter that
 * reached "generated" or "edited". Counted server-side with an inner-join
 * filter so the number is the count of PROJECTS, not chapters. Uses the
 * service-role client, which is fine here: it is an aggregate count on a
 * server component, no per-user data leaves this function.
 *
 * Returns null (never a made-up number) when credentials are missing or the
 * query fails, so a local build without .env.local still succeeds.
 */
export async function countBooksGenerated(): Promise<number | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const supabase = createServerClient();
    const { count, error } = await supabase
      .from("projects")
      .select("id, chapters!inner(id)", { count: "exact", head: true })
      .neq("status", "erased")
      .in("chapters.status", ["generated", "edited"]);
    if (error) {
      console.error("[landing-data] books count failed:", error.message);
      return null;
    }
    return typeof count === "number" ? count : null;
  } catch (err) {
    console.error("[landing-data] books count threw:", err);
    return null;
  }
}

export async function getLandingData(): Promise<LandingData> {
  return {
    founderHeadshot: FOUNDER.headshot,
    booksGenerated: await countBooksGenerated(),
  };
}
