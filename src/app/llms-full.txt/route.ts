import { llmsFullTxt } from "@/lib/llms";

// /llms-full.txt: the long-form companion to /llms.txt (about, pricing, FAQ,
// comparisons in one file). See src/lib/llms.ts.
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsFullTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
