import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// Feature keys must be registered here — an open string column invites junk rows.
const KNOWN_FEATURES = new Set(["hardcover"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/feature-interest?feature=hardcover — has this user already signed up?
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const feature = new URL(req.url).searchParams.get("feature") || "";
  if (!KNOWN_FEATURES.has(feature)) {
    return NextResponse.json({ error: "unknown feature" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error: dbError } = await supabase
    .from("feature_interest")
    .select("id")
    .eq("user_id", user.id)
    .eq("feature", feature)
    .maybeSingle();

  if (dbError) {
    logger.error("feature_interest lookup failed", {
      route: "/api/feature-interest",
      userId: user.id,
      error: dbError,
    });
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }

  return NextResponse.json({ interested: !!data });
}

// POST /api/feature-interest { feature, project_id? } — register interest. Idempotent:
// repeat clicks and double-fires land on the unique(user_id, feature) constraint.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let body: { feature?: string; project_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const feature = body.feature || "";
  if (!KNOWN_FEATURES.has(feature)) {
    return NextResponse.json({ error: "unknown feature" }, { status: 400 });
  }

  // project_id is context, not a requirement — a malformed or foreign id must not
  // block the signup, so it degrades to null instead of erroring.
  const projectId =
    body.project_id && UUID_RE.test(body.project_id) ? body.project_id : null;

  const supabase = createServerClient();
  let { error: dbError } = await supabase.from("feature_interest").upsert(
    { user_id: user.id, feature, project_id: projectId },
    { onConflict: "user_id,feature", ignoreDuplicates: true }
  );

  // FK violation on project_id (deleted project, id from another user): retry without it.
  if (dbError && projectId) {
    ({ error: dbError } = await supabase.from("feature_interest").upsert(
      { user_id: user.id, feature, project_id: null },
      { onConflict: "user_id,feature", ignoreDuplicates: true }
    ));
  }

  if (dbError) {
    logger.error("feature_interest insert failed", {
      route: "/api/feature-interest",
      userId: user.id,
      error: dbError,
    });
    return NextResponse.json({ error: "signup failed" }, { status: 500 });
  }

  return NextResponse.json({ interested: true });
}
