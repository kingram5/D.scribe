import { NextResponse } from "next/server";

export const maxDuration = 60;

// Bare minimum Claude call — no SDK, no Supabase, no imports
export async function GET() {
  const start = Date.now();

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Say hello in 10 words." }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || "no text";
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    return NextResponse.json({ ok: true, elapsed, text, status: res.status });
  } catch (err: unknown) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    return NextResponse.json({ ok: false, elapsed, error: err instanceof Error ? err.message : String(err) });
  }
}
