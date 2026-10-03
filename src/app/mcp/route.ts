import { NextRequest, NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { checkUserAccess } from "@/lib/auth";
import { chatgptFlags, protectedResourceMetadataUrl } from "@/lib/chatgpt-app/config";
import { buildMcpServer, defaultDeps } from "@/lib/chatgpt-app/server";
import { bearerFrom, SupabaseTokenVerifier, TokenError } from "@/lib/chatgpt-app/token";
import { PlanStore } from "@/lib/book-plan/persist";
import { after } from "next/server";

// POST /mcp — the D.scribe ChatGPT app (MCP streamable HTTP, stateless).
// Off unless CHATGPT_APP_MCP=true. See docs/chatgpt-app/architecture.md.
export const runtime = "nodejs";
export const maxDuration = 120;

function challenge(error: string, description: string, status = 401): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    {
      status,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${protectedResourceMetadataUrl()}", error="${error}", error_description="${description}"`,
      },
    }
  );
}

async function handle(req: NextRequest): Promise<Response> {
  if (!chatgptFlags.mcp()) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Identity: none (anonymous) or a verified OAuth token. A token that is
  // present but bad is rejected outright, never downgraded to anonymous.
  let identity: { userId: string; email: string | null } | null = null;
  const header = req.headers.get("authorization");
  if (header) {
    const token = bearerFrom(header);
    if (!token) return challenge("invalid_token", "Malformed Authorization header");
    try {
      const verified = await new SupabaseTokenVerifier().verify(token);
      const denial = await checkUserAccess(verified.user);
      if (denial) {
        return denial.code === "rate_limited"
          ? NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(Math.ceil(denial.retryAfterMs / 1000)) } })
          : challenge("insufficient_scope", denial.message, 403);
      }
      identity = { userId: verified.user.id, email: verified.user.email ?? null };
    } catch (err) {
      const reason = err instanceof TokenError ? err.reason : "invalid";
      return challenge(reason === "insufficient_scope" ? "insufficient_scope" : "invalid_token", `Token rejected (${reason})`);
    }
  }

  // Anonymous callers are rate-limited by ChatGPT's per-user subject id (read
  // per tool call in server.ts), not by IP: all ChatGPT traffic shares OpenAI's IPs.
  const deps = defaultDeps(identity);
  const server = buildMcpServer(deps);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);

  // Retention sweep, roughly 1 call in 50, after the response is sent.
  if (Math.random() < 0.02) {
    try {
      after(() => new PlanStore(deps.db).purgeExpired().catch(() => undefined));
    } catch {
      /* outside a request */
    }
  }

  try {
    return await transport.handleRequest(req);
  } finally {
    after(() => server.close().catch(() => undefined));
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// Stateless server: no standalone SSE stream and no sessions to delete.
export async function GET() {
  if (!chatgptFlags.mcp()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  if (!chatgptFlags.mcp()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } });
}
