import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase";

export const revalidate = 3600;

type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  keywords: string[] | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string;
};

async function getPost(slug: string): Promise<Post | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .single();
  return data ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Not Found | D. scribe" };
  return {
    title: `${post.seo_title ?? post.title} | D. scribe`,
    description: post.seo_description ?? post.excerpt ?? undefined,
    openGraph: {
      title: post.seo_title ?? post.title,
      description: post.seo_description ?? post.excerpt ?? undefined,
      type: "article",
      publishedTime: post.published_at,
    },
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#2C2419", color: "#F9F7F2" }}>
      <div style={{ position: "fixed", top: "10%", right: "5%", width: "30vw", height: "30vw", background: "rgba(193,122,71,0.06)", borderRadius: "50%", filter: "blur(100px)", pointerEvents: "none" }} />

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, borderBottom: "1px solid rgba(249,247,242,0.08)", background: "rgba(44,36,25,0.9)", backdropFilter: "blur(12px)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", height: 72, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#C17A47", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "var(--font-playfair), var(--font-lora), serif", fontSize: 20, paddingTop: 2 }}>D.</div>
            <span style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif", fontWeight: 600, fontSize: 18, color: "#F9F7F2" }}>scribe</span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <Link href="/blog" style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, color: "#A89F94", textDecoration: "none" }}>← Blog</Link>
          </div>
          <Link href="/login" style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, fontWeight: 600, color: "#F9F7F2", background: "#C17A47", padding: "10px 24px", borderRadius: 9999, textDecoration: "none" }}>Start with a sermon.</Link>
        </div>
      </nav>

      {/* Article */}
      <article style={{ maxWidth: 680, margin: "0 auto", padding: "64px 24px 120px", position: "relative", zIndex: 10 }}>
        {/* Meta */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 12, color: "#7A7358" }}>{formatDate(post.published_at)}</span>
          {post.keywords?.slice(0, 3).map(k => (
            <span key={k} style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#C17A47", background: "rgba(193,122,71,0.1)", padding: "2px 8px", borderRadius: 4 }}>{k}</span>
          ))}
        </div>

        {/* Title */}
        <h1 style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif", fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 400, fontStyle: "italic", color: "#F9F7F2", lineHeight: 1.2, marginBottom: 24 }}>
          {post.title}
        </h1>

        {/* Excerpt */}
        {post.excerpt && (
          <p style={{ fontFamily: "var(--font-lora), serif", fontSize: 20, color: "#A89F94", lineHeight: 1.7, marginBottom: 40, fontStyle: "italic", borderLeft: "3px solid rgba(193,122,71,0.4)", paddingLeft: 20 }}>
            {post.excerpt}
          </p>
        )}

        <div style={{ height: 1, background: "rgba(249,247,242,0.08)", marginBottom: 40 }} />

        {/* Content */}
        <div
          dangerouslySetInnerHTML={{ __html: post.content }}
          style={{
            fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
            fontSize: 17,
            lineHeight: 1.8,
            color: "#C8C0B4",
          }}
        />

        {/* CTA */}
        <div style={{ marginTop: 72, padding: "40px 36px", background: "rgba(193,122,71,0.06)", border: "1px solid rgba(193,122,71,0.2)", borderRadius: 20, textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-playfair), serif", fontSize: "clamp(20px, 3vw, 26px)", fontStyle: "italic", color: "#F9F7F2", marginBottom: 12 }}>Ready to write your book?</p>
          <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 15, color: "#A89F94", marginBottom: 28, lineHeight: 1.6 }}>Bring the words you already share, then shape each chapter into a book you can call your own.</p>
          <Link href="/login" style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 15, fontWeight: 600, color: "#fff", background: "#C17A47", padding: "13px 32px", borderRadius: 9999, textDecoration: "none", display: "inline-block" }}>Start for free</Link>
        </div>
      </article>
    </div>
  );
}
