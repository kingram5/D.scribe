import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

function isAuthorized(req: NextRequest) {
  const key = req.headers.get("x-admin-key");
  return key && key === process.env.BLOG_ADMIN_KEY;
}

// GET /api/blog/[slug] — fetch single post (public if published)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!data.published && !isAuthorized(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

// PATCH /api/blog/[slug] — update or publish a post (admin only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const body = await req.json();
  const supabase = createServerClient();

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.excerpt !== undefined) updates.excerpt = body.excerpt;
  if (body.content !== undefined) updates.content = body.content;
  if (body.keywords !== undefined) updates.keywords = body.keywords;
  if (body.seo_title !== undefined) updates.seo_title = body.seo_title;
  if (body.seo_description !== undefined) updates.seo_description = body.seo_description;
  if (body.published !== undefined) {
    updates.published = body.published;
    if (body.published) updates.published_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("blog_posts")
    .update(updates)
    .eq("slug", slug)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
