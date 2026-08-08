import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { generateDOCX } from "@/lib/export/docx";
import { loadProjectForExport } from "@/lib/export/load-chapters";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const maxDuration = 300;

// POST /api/export/drive { project_id } — builds the DOCX and uploads it to the
// user's Google Drive as a native Google Doc (Drive converts on upload).
// 428 + { connect: true } means the client should run the OAuth flow first.

async function freshAccessToken(userId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data: row } = await supabase
    .from("google_drive_tokens")
    .select("refresh_token, access_token, access_token_expires_at")
    .eq("user_id", userId)
    .single();
  if (!row?.refresh_token) return null;

  if (row.access_token && row.access_token_expires_at && new Date(row.access_token_expires_at) > new Date()) {
    return row.access_token as string;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: row.refresh_token as string,
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    // Revoked or expired grant — drop the row so the client reconnects cleanly.
    await supabase.from("google_drive_tokens").delete().eq("user_id", userId);
    return null;
  }
  const tokens = (await res.json()) as { access_token: string; expires_in: number };
  await supabase
    .from("google_drive_tokens")
    .update({
      access_token: tokens.access_token,
      access_token_expires_at: new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return tokens.access_token;
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "export");
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const { project_id } = await req.json();
  if (!project_id) return NextResponse.json({ error: "project_id required" }, { status: 400 });

  const accessToken = await freshAccessToken(user.id);
  if (!accessToken) {
    return NextResponse.json({ connect: true }, { status: 428 });
  }

  const loaded = await loadProjectForExport(project_id, user.id);
  if (!loaded) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const { project, ready } = loaded;
  if (ready.length === 0) {
    return NextResponse.json({ error: "No generated content found" }, { status: 400 });
  }

  const buffer = await generateDOCX({ title: project.title, chapters: ready });

  // Multipart upload; target mimeType makes Drive convert the DOCX into a
  // native Google Doc the user can edit immediately.
  const boundary = "dscribe" + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({
    name: project.title || "D.scribe manuscript",
    mimeType: "application/vnd.google-apps.document",
  });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const upload = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(body),
    }
  );

  if (!upload.ok) {
    const errText = (await upload.text()).slice(0, 300);
    logger.error("Drive upload failed", {
      route: "/api/export/drive",
      userId: user.id,
      meta: { status: upload.status, body: errText },
    });
    if (upload.status === 401 || upload.status === 403) {
      return NextResponse.json({ connect: true }, { status: 428 });
    }
    return NextResponse.json({ error: "Drive upload failed" }, { status: 502 });
  }

  const file = (await upload.json()) as { id: string; webViewLink?: string };
  return NextResponse.json({
    url: file.webViewLink || `https://docs.google.com/document/d/${file.id}/edit`,
  });
}
