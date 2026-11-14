import { llmsTxt } from "@/lib/llms";

// /llms.txt: short Markdown briefing for AI assistants (llmstxt.org). Built from
// the same constants the pages render; see src/lib/llms.ts. Public path in the
// middleware, allowed in robots.txt.
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
