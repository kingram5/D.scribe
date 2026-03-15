import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// GET /api/project — list all projects
export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/project — create a new project
export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      title: body.title || "Untitled Project",
      description: body.description || "",
      audience: body.audience || "General",
      user_id: body.user_id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
