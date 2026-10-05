import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { askClaudeWithUsage, cleanJson } from "@/lib/claude-lite";
import { logger } from "@/lib/logger";
import { ENRICH_SYSTEM, enrichPrompt } from "@/lib/prompts/enrich";
import { requireAuth } from "@/lib/auth";
import { checkInk, recordInkUsage } from "@/lib/ink";
import { isVerifiedEnrichment, verifiedEnrichments } from "@/lib/enrichment-policy";
import { checkRateLimit } from "@/lib/rate-limit";

// GET /api/enrich?project_id=xxx — read existing enrichments for all chapters in a project
export async function GET(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "enrich");
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, {
      status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
    });
  }

  const projectId = new URL(req.url).searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Verify project ownership
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get all enrichments for this project's chapters
  const { data: chapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("project_id", projectId);

  if (!chapters?.length) {
    return NextResponse.json({});
  }

  const chapterIds = chapters.map(c => c.id);
  const { data: enrichments } = await supabase
    .from("enrichments")
    .select("*")
    .in("chapter_id", chapterIds);

  const { data: sources, error: sourceError } = await supabase.from("research_items")
    .select("text, attribution, source_title, source_url").eq("project_id", projectId).eq("user_id", user.id).eq("status", "active");
  if (sourceError) return NextResponse.json({ error: "Could not verify quote sources." }, { status: 503 });

  // Group by chapter_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grouped: Record<string, any[]> = {};
  for (const e of verifiedEnrichments(enrichments ?? [], sources ?? [])) {
    if (!grouped[e.chapter_id]) grouped[e.chapter_id] = [];
    grouped[e.chapter_id].push(e);
  }

  return NextResponse.json(grouped);
}

// POST /api/enrich — find enrichment quotes for a chapter
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { chapter_id } = await req.json();
  if (!chapter_id) {
    return NextResponse.json({ error: "chapter_id required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Get chapter + project
  const { data: chapter } = await supabase
    .from("chapters")
    .select("*, projects(*)")
    .eq("id", chapter_id)
    .single();

  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  // Verify the chapter's project belongs to this user
  if (chapter.projects?.user_id !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pre-flight Ink check
  const inkCheck = await checkInk(user.id, "enrich");
  if (!inkCheck.allowed) {
    return NextResponse.json(
      { error: "out_of_ink", message: inkCheck.reason },
      { status: 402 }
    );
  }

  // Get key points for this chapter
  const kpIds = chapter.key_point_ids || [];
  let keyPoints: { title: string }[] | null = [];
  if (kpIds.length > 0) {
    const { data } = await supabase
      .from("key_points")
      .select("title")
      .in("id", kpIds);
    keyPoints = data;
  }

  // Refresh keeps the quotes the user has toggled ON and only replaces the rest.
  // On first generation nothing is included yet, so this is a no-op.
  const { data: existingEnrichments } = await supabase
    .from("enrichments").select("*").eq("chapter_id", chapter_id);
  const { data: researched, error: sourceError } = await supabase.from("research_items")
    .select("text, attribution, source_title, source_url").eq("project_id", chapter.projects.id).eq("user_id", user.id).eq("status", "active");
  if (sourceError) return NextResponse.json({ error: "Could not verify quote sources." }, { status: 503 });
  const sources = (researched ?? []).filter((r) => isVerifiedEnrichment({ quote_text: r.text, source_author: r.attribution, source_title: r.source_title, source_type: "research" }, researched ?? []));
  const kept = verifiedEnrichments(existingEnrichments ?? [], sources).filter((e) => e.included);
  // No source evidence means no memory-only alternatives and no billable model call.
  if (!sources.some((r) => !!r.attribution)) return NextResponse.json(kept);

  // Exclude every quote already shown ANYWHERE in this project (this chapter's
  // favorites + all other chapters' quotes) so quotes aren't recycled chapter-to-
  // chapter and a refresh returns genuinely new material.
  const { data: projectChapters } = await supabase
    .from("chapters").select("id").eq("project_id", chapter.projects.id);
  const chapterIds = (projectChapters || []).map((c) => c.id);
  let excludeTexts = kept.map((e) => e.quote_text).filter(Boolean) as string[];
  if (chapterIds.length > 0) {
    const { data: allEnr } = await supabase
      .from("enrichments").select("quote_text").in("chapter_id", chapterIds);
    excludeTexts = Array.from(new Set([...excludeTexts, ...(allEnr || []).map((e) => e.quote_text).filter(Boolean)])) as string[];
  }

  // #12 — offer the FULL candidate set, but pre-select a sensible number scaled to
  // chapter length (~1 per 750 words, capped 1-6) as a soft default. Every other
  // candidate is still shown and toggleable — this just nudges the writer toward
  // their favorite few instead of cramming all of them into a short chapter.
  const targetWords = chapter.target_word_count || 1500;
  const recommendedQuotes = Math.max(1, Math.min(6, Math.round(targetWords / 750)));


  const promptText = enrichPrompt(
    chapter.title,
    chapter.summary,
    (keyPoints || []).map((kp) => kp.title),
    chapter.projects.audience,
    chapter.projects.scripture_translation,
    excludeTexts,
    sources,
  );

  // Responses sometimes include unescaped quotes inside string values, which break
  // JSON.parse. Try once, then retry with a stricter, lower-temperature ask.
  const parseItems = (text: string): Record<string, unknown>[] | null => {
    try {
      const parsed = JSON.parse(cleanJson(text));
      return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : null;
    } catch {
      return null;
    }
  };

  try {
    const first = await askClaudeWithUsage(ENRICH_SYSTEM, promptText, { temperature: 0.4 });
    recordInkUsage(user.id, chapter.projects.id, "enrich", "quality", first.usage).catch((err) => logger.error("recordInkUsage failed", { route: "/api/enrich", userId: user.id, error: err }));

    let items = parseItems(first.text);
    if (!items) {
      const retry = await askClaudeWithUsage(
        ENRICH_SYSTEM,
        promptText + `\n\nYour previous response was not valid JSON. Return ONLY a valid JSON array, nothing else — escape every double quote inside a string value as \\", or use curly quotes “ ” for quotation marks inside quote_text.`,
        { temperature: 0.2 }
      );
      recordInkUsage(user.id, chapter.projects.id, "enrich", "quality", retry.usage).catch((err) => logger.error("recordInkUsage failed", { route: "/api/enrich", userId: user.id, error: err }));
      items = parseItems(retry.text);
    }

    if (!items) {
      return NextResponse.json({ error: "Couldn't read the quote results — please try again." }, { status: 500 });
    }

    items = verifiedEnrichments(items, sources);
    // A smaller or empty verified list is preferable to an invented substitute.
    if (!items.length) return NextResponse.json(kept);

    // Replace ONLY the un-selected quotes — the user's toggled-on favorites stay put.
    await supabase.from("enrichments").delete().eq("chapter_id", chapter_id).eq("included", false);

    // Insert fresh candidates. Auto-select up to the recommended count, counting the
    // kept favorites first, so a refresh tops up toward the suggestion without
    // overriding the picks the user already made.
    // The policy already validated source types; never invent a fallback type.
    const { data: inserted, error } = await supabase
      .from("enrichments")
      .insert(
        items.map((item: Record<string, unknown>, idx: number) => ({
          chapter_id,
          quote_text: item.quote_text,
          source_author: item.source_author,
          source_title: item.source_title,
          source_type: item.source_type,
          relevance_note: item.relevance_note || "",
          included: (kept.length + idx) < recommendedQuotes,
        }))
      )
      .select();

    if (error) {
      logger.error("Supabase insert error in enrich", {
        route: "/api/enrich",
        userId: user.id,
        error,
        meta: { chapter_id },
      });
      return NextResponse.json({ error: `DB error: ${error.message}` }, { status: 500 });
    }
    // Return the kept favorites plus the freshly generated candidates.
    return NextResponse.json([...kept, ...(inserted || [])]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enrichment failed";
    logger.error(message, {
      route: "/api/enrich",
      userId: user.id,
      error: err,
      meta: { chapter_id },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/enrich — toggle enrichment inclusion
export async function PATCH(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { id, included } = await req.json();
  const supabase = createServerClient();

  // Verify the enrichment belongs to a chapter owned by this user
  const { data: enrichment } = await supabase
    .from("enrichments")
    .select("*, chapters(project_id, projects(user_id))")
    .eq("id", id)
    .single();

  if (!enrichment) {
    return NextResponse.json({ error: "Enrichment not found" }, { status: 404 });
  }

  const projectUserId = (enrichment as unknown as {
    chapters: { projects: { user_id: string } };
  }).chapters?.projects?.user_id;

  if (projectUserId !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (typeof included !== "boolean") return NextResponse.json({ error: "included must be a boolean" }, { status: 400 });
  if (included) {
    const projectId = (enrichment as unknown as { chapters: { project_id: string } }).chapters.project_id;
    const { data: sources, error: sourceError } = await supabase.from("research_items")
      .select("text, attribution, source_title, source_url").eq("project_id", projectId).eq("user_id", user.id).eq("status", "active");
    if (sourceError) return NextResponse.json({ error: "Could not verify quote sources." }, { status: 503 });
    if (!isVerifiedEnrichment(enrichment, sources ?? [])) return NextResponse.json({ error: "This quote cannot be verified for inclusion. Choose another source." }, { status: 422 });
  }

  const { data, error } = await supabase
    .from("enrichments")
    .update({ included })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
