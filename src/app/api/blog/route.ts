import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

function isAuthorized(req: NextRequest) {
  const key = req.headers.get("x-admin-key");
  return key && key === process.env.BLOG_ADMIN_KEY;
}

// GET /api/blog — list published posts (public)
export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, excerpt, keywords, published_at")
    .eq("published", true)
    .order("published_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/blog — create or upsert a post (admin only)
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { slug, title, excerpt, content, keywords, seo_title, seo_description, published } = body;

  if (!slug || !title || !content) {
    return NextResponse.json({ error: "slug, title, and content are required" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .upsert({
      slug,
      title,
      excerpt: excerpt ?? null,
      content,
      keywords: keywords ?? [],
      seo_title: seo_title ?? title,
      seo_description: seo_description ?? excerpt ?? null,
      published: published ?? false,
      published_at: published ? new Date().toISOString() : null,
    }, { onConflict: "slug" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
