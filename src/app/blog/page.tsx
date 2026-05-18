import type { Metadata } from "next";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Blog — Voice to Book Guides & Strategies",
  description: "Practical guides, strategies, and stories for coaches, pastors, and speakers who want to turn their voice recordings into a published book. Learn how to use AI to write your manuscript faster.",
  alternates: {
    canonical: "https://d-scribe.app/blog",
  },
  openGraph: {
    title: "D.scribe Blog — Voice to Book Guides & Strategies",
    description: "Practical guides for coaches, pastors, and speakers ready to publish their book with AI transcription and manuscript generation.",
    url: "https://d-scribe.app/blog",
    siteName: "D.scribe",
    type: "website",
  },
};

const blogSchema = {
  "@context": "https://schema.org",
  "@type": "Blog",
  name: "D.scribe Blog",
  url: "https://d-scribe.app/blog",
  description: "Guides and strategies for turning voice recordings into published books with AI",
  publisher: { "@type": "Organization", name: "D.scribe", url: "https://d-scribe.app" },
};

export const revalidate = 3600;

type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  keywords: string[] | null;
  published_at: string;
};

async function getPosts(): Promise<Post[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("blog_posts")
    .select("id, slug, title, excerpt, keywords, published_at")
    .eq("published", true)
    .order("published_at", { ascending: false });
  return data ?? [];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogIndexPage() {
  const posts = await getPosts();

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogSchema) }} />
    <div style={{ minHeight: "100vh", backgroundColor: "#2C2419", color: "#F9F7F2" }}>
      {/* Ambient glow */}
      <div style={{ position: "fixed", top: "15%", left: "5%", width: "35vw", height: "35vw", background: "rgba(193,122,71,0.07)", borderRadius: "50%", filter: "blur(120px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "10%", right: "5%", width: "25vw", height: "25vw", background: "rgba(217,139,88,0.05)", borderRadius: "50%", filter: "blur(100px)", pointerEvents: "none" }} />

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, borderBottom: "1px solid rgba(249,247,242,0.08)", background: "rgba(44,36,25,0.9)", backdropFilter: "blur(12px)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", height: 72, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#C17A47", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "var(--font-playfair), var(--font-lora), serif", fontSize: 20, paddingTop: 2 }}>D.</div>
            <span style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif", fontWeight: 600, fontSize: 18, color: "#F9F7F2" }}>scribe</span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <Link href="/pricing" style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, color: "#A89F94", textDecoration: "none" }}>Pricing</Link>
            <Link href="/blog" style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, color: "#F9F7F2", textDecoration: "none", fontWeight: 600 }}>Blog</Link>
          </div>
          <Link href="/login" style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, fontWeight: 600, color: "#F9F7F2", background: "#C17A47", padding: "10px 24px", borderRadius: 9999, textDecoration: "none" }}>Get Started</Link>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "72px 24px 56px", position: "relative", zIndex: 10 }}>
        <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#C17A47", marginBottom: 16 }}>The D. scribe Blog</p>
        <h1 style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 400, fontStyle: "italic", color: "#F9F7F2", lineHeight: 1.2, marginBottom: 20 }}>
          Turning your voice<br />into a published book
        </h1>
        <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 17, color: "#A89F94", lineHeight: 1.7, maxWidth: 560 }}>
          Guides, strategies, and stories for coaches, pastors, and speakers who have a book inside them. Every article here is built around one question: how do you turn what you already know — the sermons, the talks, the coaching sessions — into a book you&apos;re proud to hand someone?
        </p>
        <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 15, color: "#7A7358", lineHeight: 1.75, maxWidth: 520, marginTop: 16 }}>
          You&apos;ll find practical walkthroughs of the D.scribe workflow, guidance on structuring your ideas before you write, and honest takes on what it actually takes to go from &ldquo;I should write a book&rdquo; to a finished manuscript.
        </p>
      </div>

      {/* Posts */}
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 24px 120px", position: "relative", zIndex: 10 }}>
        {posts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#7A7358", fontFamily: "var(--font-inter), sans-serif", fontSize: 15 }}>
            First article coming soon.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {posts.map((post, i) => (
              <Link key={post.id} href={`/blog/${post.slug}`} style={{ textDecoration: "none", display: "block" }}>
                <div style={{
                  padding: "36px 0",
                  borderBottom: "1px solid rgba(249,247,242,0.08)",
                  borderTop: i === 0 ? "1px solid rgba(249,247,242,0.08)" : "none",
                  transition: "padding-left 0.2s ease",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 12, color: "#7A7358" }}>{formatDate(post.published_at)}</span>
                    {post.keywords?.slice(0, 2).map(k => (
                      <span key={k} style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#C17A47", background: "rgba(193,122,71,0.1)", padding: "2px 8px", borderRadius: 4 }}>{k}</span>
                    ))}
                  </div>
                  <h2 style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif", fontSize: "clamp(20px, 3vw, 26px)", fontWeight: 400, color: "#F9F7F2", lineHeight: 1.3, marginBottom: 12 }}>{post.title}</h2>
                  {post.excerpt && (
                    <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 15, color: "#A89F94", lineHeight: 1.7, marginBottom: 16 }}>{post.excerpt}</p>
                  )}
                  <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, fontWeight: 600, color: "#C17A47" }}>Read article →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
