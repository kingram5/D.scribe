import type { MetadataRoute } from "next";
import { createServerClient } from "@/lib/supabase";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient();
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("slug, published_at, updated_at")
    .eq("published", true);

  const blogEntries: MetadataRoute.Sitemap = (posts ?? []).map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.updated_at ?? post.published_at,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Comparison pages (HeyCatch action plan): high-intent competitor-name search
  // traffic, so they outrank /about on priority.
  const vsEntries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/vs`,
      lastModified: new Date("2026-09-14"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...["builtwritten", "squibler", "dictate"].map((slug) => ({
      url: `${SITE_URL}/vs/${slug}`,
      lastModified: new Date("2026-09-14"),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date("2026-09-10"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    ...vsEntries,
    // Creator program (live 2026-09-25); public and canonical but was never listed here.
    {
      url: `${SITE_URL}/partners`,
      lastModified: new Date("2026-09-25"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/legal/partners`,
      lastModified: new Date("2026-09-25"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...["terms", "privacy", "refunds", "acceptable-use", "dmca"].map((slug) => ({
      url: `${SITE_URL}/legal/${slug}`,
      lastModified: new Date("2026-09-09"),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
    ...blogEntries,
  ];
}