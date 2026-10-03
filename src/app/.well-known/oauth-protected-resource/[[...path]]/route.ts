import { NextResponse } from "next/server";
import { authIssuer, chatgptFlags, REQUIRED_SCOPES, resourceUrl, siteUrl } from "@/lib/chatgpt-app/config";

// RFC 9728 protected resource metadata for the /mcp resource. Served at both
// /.well-known/oauth-protected-resource and the path-suffixed form
// /.well-known/oauth-protected-resource/mcp, since clients try either.
export async function GET() {
  if (!chatgptFlags.mcp()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(
    {
      resource: resourceUrl(),
      authorization_servers: [authIssuer()],
      scopes_supported: [...REQUIRED_SCOPES],
      bearer_methods_supported: ["header"],
      resource_name: "D.scribe",
      resource_documentation: `${siteUrl()}/chatgpt`,
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
