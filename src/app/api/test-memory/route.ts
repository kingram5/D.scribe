import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { chunkTranscript } from "@/lib/chunker";
import { KEY_POINTS_SYSTEM, keyPointsPrompt } from "@/lib/prompts/key-points";

export const maxDuration = 60;

// Full analysis test with Supabase + chunker + Claude raw fetch
export async function GET() {
  const start = Date.now();
  const steps: string[] = [];

  try {
    // Step 1: Auth
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;
    steps.push("auth:" + ((Date.now() - start) / 1000).toFixed(1) + "s");

    // Step 2: Load transcript
    const supabase = createServerClient();
    const { data: projects } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (!projects?.length) return NextResponse.json({ ok: false, error: "No projects" });

    const { data: transcript } = await supabase
      .from("transcripts")
      .select("id, full_text")
      .eq("project_id", projects[0].id)
      .limit(1)
      .single();

    if (!transcript) return NextResponse.json({ ok: false, error: "No transcript" });
    steps.push("db:" + ((Date.now() - start) / 1000).toFixed(1) + "s words:" + transcript.full_text.split(/\s+/).length);

    // Step 3: Chunk
    const chunks = chunkTranscript(transcript.full_text);
    steps.push("chunk:" + ((Date.now() - start) / 1000).toFixed(1) + "s n:" + chunks.length);

    // Step 4: Call Claude with chunk 0
    const prompt = keyPointsPrompt(chunks[0].text, 0, chunks.length, []);
    steps.push("prompt:" + ((Date.now() - start) / 1000).toFixed(1) + "s len:" + prompt.length);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        temperature: 0.6,
        system: KEY_POINTS_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || "no text";
    steps.push("claude:" + ((Date.now() - start) / 1000).toFixed(1) + "s status:" + res.status + " len:" + text.length);

    return NextResponse.json({ ok: true, steps });
  } catch (err: unknown) {
    steps.push("error:" + ((Date.now() - start) / 1000).toFixed(1) + "s");
    return NextResponse.json({ ok: false, steps, error: err instanceof Error ? err.message : String(err) });
  }
}
