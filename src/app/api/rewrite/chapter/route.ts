import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { creativeFreedomToTemp } from "@/lib/claude-lite";
import { streamClaude } from "@/lib/claude-stream";
import { rewriteChapterSystem, rewriteChapterPrompt } from "@/lib/prompts/rewrite";
import { loadStyleMemory, styleMemoryPromptBlock } from "@/lib/style-memory";
import { checkInk, recordInkUsage } from "@/lib/ink";
import { logger } from "@/lib/logger";

// POST /api/rewrite/chapter — streaming full chapter rewrite
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "rewrite");
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please wait." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
        },
      }
    );
  }

  // Pre-flight Ink check
  const inkCheck = await checkInk(user.id, "rewrite");
  if (!inkCheck.allowed) {
    return new Response(
      JSON.stringify({ error: "out_of_ink", message: inkCheck.reason }),
      { status: 402, headers: { "Content-Type": "application/json" } }
    );
  }

  const { chapter_id, feedback, creative_freedom = 50 } = await req.json();

  if (!chapter_id || !feedback?.trim()) {
    return new Response(
      JSON.stringify({ error: "chapter_id and feedback are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createServerClient();

  // Fetch chapter + verify ownership
  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, project_id, chapter_number, title")
    .eq("id", chapter_id)
    .single();

  if (!chapter) {
    return new Response(JSON.stringify({ error: "Chapter not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, voice_profile, user_id")
    .eq("id", chapter.project_id)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get current chapter content
  const { data: currentContent } = await supabase
    .from("chapter_contents")
    .select("content")
    .eq("chapter_id", chapter_id)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (!currentContent?.content) {
    return new Response(
      JSON.stringify({ error: "No content to rewrite" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Fetch adjacent chapter tails for transition context
  const { data: allChapters } = await supabase
    .from("chapters")
    .select("id, chapter_number")
    .eq("project_id", chapter.project_id)
    .order("chapter_number", { ascending: true });

  let previousChapterTail: string | undefined;
  let nextChapterHead: string | undefined;

  if (allChapters) {
    const prevChapter = allChapters.find(
      (c) => c.chapter_number === chapter.chapter_number - 1
    );
    const nextChapter = allChapters.find(
      (c) => c.chapter_number === chapter.chapter_number + 1
    );

    if (prevChapter) {
      const { data: prevContent } = await supabase
        .from("chapter_contents")
        .select("content")
        .eq("chapter_id", prevChapter.id)
        .order("version", { ascending: false })
        .limit(1)
        .single();
      if (prevContent?.content) {
        const words = prevContent.content.split(/\s+/);
        previousChapterTail = words.slice(-300).join(" ");
      }
    }

    if (nextChapter) {
      const { data: nextContent } = await supabase
        .from("chapter_contents")
        .select("content")
        .eq("chapter_id", nextChapter.id)
        .order("version", { ascending: false })
        .limit(1)
        .single();
      if (nextContent?.content) {
        const words = nextContent.content.split(/\s+/);
        nextChapterHead = words.slice(0, 300).join(" ");
      }
    }
  }

  const styleMemory = await loadStyleMemory(user.id);
  const system = rewriteChapterSystem(project.voice_profile, styleMemoryPromptBlock(styleMemory));
  const prompt = rewriteChapterPrompt({
    currentContent: currentContent.content,
    feedback,
    chapterTitle: chapter.title,
    previousChapterTail,
    nextChapterHead,
  });

  // Editorial memory: capture the rewrite instruction (the result streams to
  // the client; the net text change is captured by the manual-save diff).
  const { error: eventErr } = await supabase.from("edit_events").insert({
    user_id: user.id,
    project_id: chapter.project_id,
    chapter_id,
    kind: "rewrite_bar",
    instruction: String(feedback).slice(0, 1000),
    before_text: currentContent.content.slice(0, 4000),
    after_text: "",
  });
  if (eventErr) {
    logger.error("edit_events insert failed", { route: "/api/rewrite/chapter", userId: user.id, error: eventErr });
  }

  const temperature = creativeFreedomToTemp(creative_freedom);

  const stream = streamClaude(system, prompt, {
    maxTokens: 16384,
    temperature,
    onUsage: (usage) => {
      recordInkUsage(user.id, chapter.project_id, "rewrite", "quality", usage).catch((err) => logger.error("recordInkUsage failed", { route: "/api/rewrite/chapter", userId: user.id, error: err }));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
