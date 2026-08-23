import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { loadBookReadiness } from "@/lib/copyright-readiness-data";

// POST /api/copyright-readiness — book-level authorship bands.
// Fully deterministic (no model call, no Ink). Uncached in v1.
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { project_id } = await req.json();
  if (!project_id) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const loaded = await loadBookReadiness(project_id, user.id);
  if (!loaded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(loaded.readiness);
}
