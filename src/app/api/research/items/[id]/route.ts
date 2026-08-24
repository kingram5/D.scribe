import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.status !== "dismissed") {
    return NextResponse.json({ error: "status must be dismissed" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: item } = await supabase
    .from("research_items")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("research_items")
    .update({ status: "dismissed" })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
