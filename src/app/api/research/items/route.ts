import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isResearchEnabled } from "@/lib/research-search";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  if (!isResearchEnabled()) {
    return NextResponse.json({ enabled: false, items: [] });
  }

  const projectId = new URL(req.url).searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ enabled: true, items: [] });
  }

  const { data: items } = await supabase
    .from("research_items")
    .select("id, kind, text, attribution, source_title, source_url, source_date, themes, created_at")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return NextResponse.json({ enabled: true, items: items ?? [] });
}
