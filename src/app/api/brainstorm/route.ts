import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkInk, recordInkUsage } from "@/lib/ink";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a warm, curious brainstorming partner helping someone develop ideas for their manuscript. Your job is to draw ideas OUT of the user — not to lecture or generate content for them.

You exist ONLY to help with book and manuscript ideation. If the user asks for anything unrelated to developing their writing (coding, general questions, advice, etc.), redirect them: "I'm here to help you brainstorm your book — what are you thinking about writing?"

CONTENT POLICY — You must refuse to help develop content involving:
- Graphic or gratuitous violence, torture, or gore
- Sexual or erotic content
- Content sexualizing minors in any way
- Hate speech, slurs, or content targeting protected groups
- Detailed instructions for illegal activity, weapons, or drugs
- Self-harm or suicide methods
- Extremist ideology or radicalization

If a user steers toward these topics, respond: "That's outside what I can help with here. Let's focus on a different angle for your book — what else is on your mind?"

Rules:
- Ask one question at a time. Never ask multiple questions in a single message.
- Keep responses under 3 sentences. Be concise.
- Be genuinely curious — follow threads the user seems excited about.
- Gently probe for specifics: "What do you mean by that?", "Can you give an example?", "Who would benefit most from hearing this?"
- Mirror their language and energy level.
- Don't summarize what they said back to them — just push forward.
- If they go broad, help them narrow. If they go narrow, ask what the bigger picture is.
- Never suggest book titles, chapter structures, or outlines — that comes later in the pipeline.
- You are NOT writing their book. You are helping them figure out what they want to say.

Start by asking what they want to write about today. Keep it casual.`;

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  // Pre-flight Ink check
  const inkCheck = await checkInk(user.id);
  if (!inkCheck.allowed) {
    return new Response(
      JSON.stringify({ error: "out_of_ink", message: inkCheck.reason }),
      { status: 402, headers: { "Content-Type": "application/json" } }
    );
  }

  const { messages } = await req.json();

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "messages array required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Build Claude messages from chat history
  const claudeMessages = messages.map((m: { role: string; content: string }) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      temperature: 0.7,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: claudeMessages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: `Claude API ${res.status}: ${err.slice(0, 200)}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Stream the response
  const encoder = new TextEncoder();
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      let inputTokens = 0;
      let outputTokens = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);
              if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
              }
              if (event.type === "message_start" && event.message?.usage) {
                inputTokens = event.message.usage.input_tokens || 0;
              }
              if (event.type === "message_delta" && event.usage) {
                outputTokens = event.usage.output_tokens || 0;
              }
            } catch {
              // skip malformed
            }
          }
        }
        // Record Ink usage
        if (inputTokens > 0 || outputTokens > 0) {
          recordInkUsage(user.id, null, "brainstorm", "fast", { input_tokens: inputTokens, output_tokens: outputTokens }).catch(console.error);
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
