import type { MetadataRoute } from "next";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient();
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("slug, published_at, updated_at")
    .eq("published", true);

  const blogEntries: MetadataRoute.Sitemap = (posts ?? []).map((post) => ({
    url: `https://d-scribe.app/blog/${post.slug}`,
    lastModified: post.updated_at ?? post.published_at,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [
    {
      url: "https://d-scribe.app",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: "https://d-scribe.app/pricing",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://d-scribe.app/blog",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    ...blogEntries,
  ];
}
