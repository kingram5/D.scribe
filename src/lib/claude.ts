import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

export async function askClaude(
  system: string,
  userMessage: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: options?.maxTokens ?? 8192,
    temperature: options?.temperature ?? 0.6,
    system,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content[0];
  if (block.type === "text") return block.text;
  return "";
}

export async function streamClaude(
  system: string,
  userMessage: string,
  options?: { temperature?: number; maxTokens?: number }
) {
  const anthropic = getClient();
  return anthropic.messages.stream({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: options?.maxTokens ?? 8192,
    temperature: options?.temperature ?? 0.6,
    system,
    messages: [{ role: "user", content: userMessage }],
  });
}

// Map creative freedom slider (0-100) to temperature (0.3-0.9)
export function creativeFreedomToTemp(freedom: number): number {
  return 0.3 + (freedom / 100) * 0.6;
}

// Map creative freedom to prompt instruction
export function creativeFreedomToInstruction(freedom: number): string {
  if (freedom <= 30) {
    return "Stay very close to the transcript language and structure. Preserve the speaker's exact phrasing where possible.";
  } else if (freedom <= 70) {
    return "Expand and restructure while keeping the core message. Smooth transitions, develop ideas further, but maintain the speaker's voice.";
  } else {
    return "Freely interpret, add transitions, expand illustrations, develop new analogies. The transcript is a starting point, not a constraint.";
  }
}
