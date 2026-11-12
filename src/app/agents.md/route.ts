import { NextRequest, NextResponse } from "next/server";
import { SITE_URL } from "@/lib/site";
import { chatgptFlags } from "@/lib/chatgpt-app/config";
import { agentsMarkdown } from "@/lib/chatgpt-app/agents-md";

// GET /agents.md: plain instructions for a user's AI assistant (see
// src/lib/chatgpt-app/agents-md.ts). 404 unless CHATGPT_APP_MCP=true, the same
// switch as /mcp, so it never describes a connector that is not answering.
// The Settings "Connect your AI" card shows only when this answers 200.
// Served on www only: the apex is redirected here, never served.
export const dynamic = "force-dynamic";

function respond(req: NextRequest, withBody: boolean): NextResponse {
  if (!chatgptFlags.mcp()) {
    return new NextResponse(withBody ? "Not found\n" : null, {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  if (host === "d-scribe.app") {
    return NextResponse.redirect(`${SITE_URL}/agents.md`, 308);
  }
  const body = agentsMarkdown();
  return new NextResponse(withBody ? body : null, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      Link: `<${SITE_URL}/agents.md>; rel="canonical"`,
      // Out of search results until the app launches, like /chatgpt; assistants
      // still fetch it. Drop at launch (docs/chatgpt-app/launch-checklist.md).
      "X-Robots-Tag": "noindex",
    },
  });
}

export function GET(req: NextRequest) {
  return respond(req, true);
}

export function HEAD(req: NextRequest) {
  return respond(req, false);
}
