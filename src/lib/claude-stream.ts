/**
 * Streaming Claude API client using raw fetch + SSE parsing.
 * Mirrors claude-lite.ts but returns a ReadableStream of text deltas.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

import type { ModelTier, ClaudeUsage } from "./claude-lite";

const MODELS: Record<ModelTier, string> = {
  fast: "claude-haiku-4-5-20251001",
  quality: "claude-sonnet-4-20250514",
};

/**
 * Stream a Claude response as a ReadableStream of text chunks.
 * Use this for long-form generation where the user shouldn't stare at a blank screen.
 * Optional onUsage callback fires with token counts when the stream completes.
 */
export function streamClaude(
  system: string,
  userMessage: string,
  options?: {
    model?: ModelTier;
    maxTokens?: number;
    temperature?: number;
    onUsage?: (usage: ClaudeUsage) => void;
  }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY!,
            "anthropic-version": API_VERSION,
          },
          body: JSON.stringify({
            model: MODELS[options?.model ?? "quality"],
            max_tokens: options?.maxTokens ?? 16384,
            temperature: options?.temperature ?? 0.6,
            stream: true,
            system,
            messages: [{ role: "user", content: userMessage }],
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: `Claude API ${res.status}: ${err.slice(0, 200)}` })}\n\n`)
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);
              if (
                event.type === "content_block_delta" &&
                event.delta?.type === "text_delta"
              ) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
                );
              }
              // Capture usage from message_start and message_delta events
              if (event.type === "message_start" && event.message?.usage) {
                inputTokens = event.message.usage.input_tokens || 0;
              }
              if (event.type === "message_delta" && event.usage) {
                outputTokens = event.usage.output_tokens || 0;
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }

        // Fire usage callback
        if (options?.onUsage && (inputTokens > 0 || outputTokens > 0)) {
          options.onUsage({ input_tokens: inputTokens, output_tokens: outputTokens });
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });
}
