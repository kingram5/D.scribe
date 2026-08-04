/**
 * Streaming Claude API client using raw fetch + SSE parsing.
 * Mirrors claude-lite.ts but returns a ReadableStream of text deltas.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

import type { ModelTier, ClaudeUsage } from "./claude-lite";
import { MODELS } from "./claude-lite";

/**
 * Stream a Claude response as a ReadableStream of text chunks.
 * Use this for long-form generation where the user shouldn't stare at a blank screen.
 *
 * Usage accounting: the Messages streaming API puts input_tokens in
 * message_start and output_tokens in message_delta — reading only the delta
 * billed every rewrite/chapter call's input (the larger half) as zero.
 * onUsage fires exactly once, including on error and client cancel, so
 * whatever DID stream gets billed.
 */
export function streamClaude(
  system: string,
  userMessage: string,
  options?: { model?: ModelTier; maxTokens?: number; temperature?: number; onUsage?: (usage: ClaudeUsage) => void }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const upstreamAbort = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  let inputTokens = 0;
  let outputTokens = 0;
  let usageEmitted = false;
  const emitUsage = () => {
    if (usageEmitted) return;
    usageEmitted = true;
    if (options?.onUsage && (inputTokens > 0 || outputTokens > 0)) {
      options.onUsage({ input_tokens: inputTokens, output_tokens: outputTokens });
    }
  };

  return new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          signal: upstreamAbort.signal,
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

        reader = res.body!.getReader();
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
              } else if (event.type === "message_start" && event.message?.usage) {
                inputTokens = event.message.usage.input_tokens ?? 0;
              } else if (event.type === "message_delta" && event.usage) {
                outputTokens = event.usage.output_tokens ?? outputTokens;
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }

        emitUsage();
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        // Bill whatever streamed before the failure — a dead client controller
        // used to skip onUsage entirely, making an abandoned generation both
        // fully paid to the vendor and never billed to the user.
        emitUsage();
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          // Controller already dead (client gone) — nothing left to tell it.
        }
      }
    },
    cancel() {
      // Client walked away: abort upstream so Anthropic stops generating
      // tokens nobody will read, then settle usage for what already streamed.
      upstreamAbort.abort();
      reader?.cancel().catch(() => {});
      emitUsage();
    },
  });
}
