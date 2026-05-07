import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { generatePDF } from "@/lib/export/pdf";
import { generateDOCX } from "@/lib/export/docx";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/export — export manuscript as PDF or DOCX
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "export");
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }

  const { project_id, format = "pdf" } = await req.json();
  if (!project_id) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Get project — verify ownership
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get chapters with latest content
  const { data: chapters } = await supabase
    .from("chapters")
    .select("*")
    .eq("project_id", project_id)
    .order("sort_order");

  if (!chapters?.length) {
    return NextResponse.json({ error: "No chapters found" }, { status: 400 });
  }

  // Get latest content for each chapter
  const chaptersWithContent = await Promise.all(
    chapters.map(async (ch) => {
      const { data: content } = await supabase
        .from("chapter_contents")
        .select("*")
        .eq("chapter_id", ch.id)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      return { ...ch, content: content || { content: "", word_count: 0 } };
    })
  );

  // Filter out chapters with no content
  const ready = chaptersWithContent.filter((ch) => ch.content.content);
  if (ready.length === 0) {
    return NextResponse.json(
      { error: "No generated content found" },
      { status: 400 }
    );
  }

  const exportOpts = {
    title: project.title,
    chapters: ready,
  };

  let buffer: Buffer;
  let contentType: string;
  let ext: string;

  if (format === "docx") {
    buffer = await generateDOCX(exportOpts);
    contentType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    ext = "docx";
  } else {
    buffer = await generatePDF(exportOpts);
    contentType = "application/pdf";
    ext = "pdf";
  }

  const filename = `${project.title.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
