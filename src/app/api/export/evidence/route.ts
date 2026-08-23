import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateEvidencePDF, loadEvidenceForProject } from "@/lib/export/evidence-bundle";

export const maxDuration = 300;

// POST /api/export/evidence — authorship evidence PDF. No model calls.
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

  const { project_id } = await req.json();
  if (!project_id) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const bundle = await loadEvidenceForProject(project_id, user.id);
  if (!bundle) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const buffer = await generateEvidencePDF(bundle);

  const asciiBase = bundle.title
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
  const fallback = `${asciiBase || "manuscript"}-authorship-evidence.pdf`;
  const utf8Name = encodeURIComponent(`${bundle.title} authorship evidence.pdf`);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${utf8Name}`,
    },
  });
}
