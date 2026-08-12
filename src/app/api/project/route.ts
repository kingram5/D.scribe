import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

// GET /api/project — list user's projects
export async function GET() {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/project — create a new project
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const body = await req.json();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      title: body.title || "Untitled Project",
      description: body.description || "",
      audience: body.audience || "General",
      // Only set for scripture audiences; the client sends null otherwise.
      scripture_translation: body.scripture_translation || null,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
