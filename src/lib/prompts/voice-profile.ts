import { VoiceProfile } from "@/types";

export const VOICE_PROFILE_SYSTEM = `You are a linguistic analyst specializing in speaker/author voice profiling. Analyze speaking patterns to create a replicable style guide.`;

export function voiceProfilePrompt(
  transcriptSamples: string[],
  existingProfile?: VoiceProfile | null
): string {
  const samplesBlock = transcriptSamples
    .map((s, i) => `--- Sample ${i + 1} ---\n${s}`)
    .join("\n\n");

  let prompt = `Analyze the following transcript(s) and create a detailed voice profile.

${samplesBlock}

Produce a voice profile with these dimensions:
- tone: Overall emotional/rhetorical tone (2-4 descriptors)
- sentence_patterns: How sentences are typically structured and sequenced
- vocabulary_level: Complexity and register of word choice
- rhetorical_devices: Specific devices used repeatedly (with examples from the text)
- signature_phrases: Recurring phrases or verbal tics (exact quotes)
- pacing: How ideas build within a section
- illustration_style: How examples, stories, and metaphors are used
- avg_sentence_length: Estimated average in words
- formality_score: 1-5 scale (1 = very casual, 5 = very formal)`;

  if (existingProfile) {
    prompt += `\n\nCurrent profile:\n${JSON.stringify(existingProfile, null, 2)}\nUpdate this profile based on the new transcript(s). Note what changed.`;
  }

  prompt += `\n\nReturn valid JSON matching the schema above. No markdown fencing.`;
  return prompt;
}
