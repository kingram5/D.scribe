import { NextRequest, NextResponse } from "next/server";
import { generatePDF } from "@/lib/export/pdf";
import { generateDOCX } from "@/lib/export/docx";
import { loadProjectForExport } from "@/lib/export/load-chapters";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

// A full-length manuscript is the expected input; without this the function
// inherits the default duration and the biggest books are the ones that fail.
export const maxDuration = 300;

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

  const loaded = await loadProjectForExport(project_id, user.id);
  if (!loaded) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const { project, ready } = loaded;
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

  // ASCII fallback for the plain filename param (header-injection-safe), plus
  // RFC 5987 filename* so a title in Arabic, Chinese or Cyrillic downloads
  // under its real name instead of "_________.pdf".
  const asciiBase = project.title
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
  const fallback = `${asciiBase || "manuscript"}.${ext}`;
  const utf8Name = encodeURIComponent(`${project.title}.${ext}`);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${utf8Name}`,
    },
  });
}
