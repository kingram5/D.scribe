import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const project_id = searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: chapters, error } = await supabase
    .from("chapters")
    .select("id, chapter_number, target_word_count, status")
    .eq("project_id", project_id)
    .order("chapter_number");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ungenerated = (chapters || []).filter((ch) => ch.status !== "generated");

  if (ungenerated.length === 0) {
    return NextResponse.json({
      per_chapter: [],
      total_low: 0,
      total_high: 0,
      chapter_count: 0,
    });
  }

  const per_chapter = ungenerated.map((ch) => {
    const input = 2000 + ch.chapter_number * 150;
    const output = (ch.target_word_count || 0) * 1.35;
    return Math.round(((input + output) / 1000) * 10) / 10;
  });

  const total = per_chapter.reduce((sum, v) => sum + v, 0);
  const total_low = Math.max(0, Math.round((total - 5) * 10) / 10);
  const total_high = Math.round((total + 5) * 10) / 10;

  return NextResponse.json({
    per_chapter,
    total_low,
    total_high,
    chapter_count: ungenerated.length,
  });
}
