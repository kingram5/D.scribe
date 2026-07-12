import { describe, it, expect } from "vitest";
import {
  lintAITells,
  buildVoiceBaseline,
  voiceMatchScore,
  splitSentences,
} from "../voice-match";
import { BANNED_PHRASES } from "../ai-tells";
import { HUMANIZER_RULES } from "../prompts/generate";
import { VoiceProfile } from "@/types";

const AI_SLOP = `In today's world, the journey of transformation is a testament to the power of resilience. It's not about perfection — it's about progress. Let's dive deep and unpack the multifaceted tapestry of growth.

Here's the thing: we must leverage our robust framework to unlock our potential. This isn't just a paradigm shift, but a groundbreaking evolution. At the end of the day, what truly resonates is the seamless integration of purpose.

It's worth noting that the landscape of personal development is transformative. Ultimately, we must navigate these challenges and harness our inner strength. Isn't that what matters?

The reality is, when all is said and done, we embark on a myriad of journeys. Furthermore, each pivotal moment serves as a reminder of our comprehensive capacity for change — a truly cutting-edge insight.`;

const CLEAN_HUMAN = `I remember the night my father called me into the garage. He'd been working on that old truck for three years, and it still wouldn't start.

"Sit down," he said. So I sat.

He didn't talk about the truck. He talked about my grades, my attitude, the way I'd been treating my mother since the layoff. He talked for maybe ten minutes, and I don't think I said five words. When he finished, he handed me the wrench and we worked until midnight.

That truck never did run. But something else started that night, and it's still running thirty years later. My father knew something I didn't: a boy doesn't need a lecture. He needs a place to stand next to his old man while the hard words settle.

We fixed nothing. We fixed everything.`;

// Spoken-style baseline corpus (short punchy sentences, heavy contractions)
const TRANSCRIPT = `Let me tell you something. I've seen this a hundred times. You don't get to skip the hard part. Nobody does. I didn't, you won't, and that's fine.

Here is what happened to me back in Odessa. We'd lost everything on that first deal. I'm not exaggerating. My wife looked at me and she said, are we going to be okay. And I said, I don't know. That was the truth. I didn't know.

But you show up the next morning. That's the whole secret. You show up the next morning. People ask me what changed everything for us and I tell them, it wasn't a strategy. I just refused to stay down. You can't beat a man who won't stay down.`;

const PROFILE: VoiceProfile = {
  tone: "direct, warm",
  sentence_patterns: "short declaratives",
  vocabulary_level: "plain",
  rhetorical_devices: ["repetition"],
  signature_phrases: [
    "you show up the next morning",
    "won't stay down",
    "let me tell you something",
  ],
  pacing: "builds fast",
  illustration_style: "personal stories",
  avg_sentence_length: 9,
  formality_score: 2,
} as VoiceProfile;

describe("lintAITells", () => {
  it("scores AI slop far below clean human prose", () => {
    const slop = lintAITells(AI_SLOP);
    const clean = lintAITells(CLEAN_HUMAN);
    expect(slop.score).toBeLessThan(40);
    expect(clean.score).toBeGreaterThan(85);
    expect(clean.score - slop.score).toBeGreaterThan(50);
  });

  it("counts em dashes", () => {
    expect(lintAITells(AI_SLOP).emDashes).toBeGreaterThanOrEqual(2);
    expect(lintAITells(CLEAN_HUMAN).emDashes).toBe(0);
  });

  it("detects banned phrases including inflections", () => {
    const report = lintAITells("We will delve into this. She delves deeper. They delved further.");
    const delve = report.bannedHits.find((b) => b.phrase === "delve");
    expect(delve?.count).toBe(3);
  });

  it("detects negation-flip patterns", () => {
    const report = lintAITells(
      "It's not about the money, it's about the message. This is not just a plan, but a promise."
    );
    expect(report.negationFlips).toBeGreaterThanOrEqual(2);
  });

  it("flags rhetorical-question transitions", () => {
    expect(lintAITells(AI_SLOP).rhetoricalTransitions).toBeGreaterThanOrEqual(1);
  });

  it("matches curly-apostrophe variants of banned phrases", () => {
    const report = lintAITells("Let’s be real about this situation.");
    expect(report.bannedHits.some((b) => b.phrase === "let's be real")).toBe(true);
  });

  it("does not fire inside larger words", () => {
    const report = lintAITells("The journeyman electrician checked the panel.");
    expect(report.bannedHits.find((b) => b.phrase === "journey")).toBeUndefined();
  });
});

describe("prompt/linter sync", () => {
  it("every linted phrase is banned in HUMANIZER_RULES", () => {
    const rules = HUMANIZER_RULES.toLowerCase();
    const missing = BANNED_PHRASES.filter((p) => !rules.includes(p.toLowerCase()));
    expect(missing).toEqual([]);
  });
});

describe("buildVoiceBaseline", () => {
  it("captures spoken-style statistics", () => {
    const baseline = buildVoiceBaseline([TRANSCRIPT], PROFILE);
    expect(baseline.sentenceLenMean).toBeGreaterThan(4);
    expect(baseline.sentenceLenMean).toBeLessThan(16);
    expect(baseline.contractionRate).toBeGreaterThan(2);
    expect(baseline.signaturePhrases.length).toBe(3);
    expect(baseline.sourceWordCount).toBeGreaterThan(100);
  });

  it("works without a voice profile", () => {
    const baseline = buildVoiceBaseline([TRANSCRIPT], null);
    expect(baseline.signaturePhrases).toEqual([]);
  });
});

describe("voiceMatchScore", () => {
  const baseline = buildVoiceBaseline([TRANSCRIPT], PROFILE);

  it("scores voice-faithful prose above off-voice academic prose", () => {
    const faithful = `Let me tell you something about failure. I've been there. You don't plan for it, and it doesn't care about your plans.

We lost the deal. We lost the house. My wife asked if we'd be okay and I told her the truth. I didn't know.

But here's what I did know. You show up the next morning. That's it. That's the whole secret. I refused to stay down, and you can't beat a man who won't stay down.`;

    const offVoice = `The phenomenological implications of entrepreneurial failure constitute a remarkably understudied domain within contemporary organizational psychology, particularly regarding the intersectionality of financial precarity and familial relationship dynamics. Researchers have consistently demonstrated that individuals experiencing significant professional setbacks exhibit heightened cortisol responses. The subsequent recalibration of professional identity necessitates a comprehensive framework of resilience-oriented behavioral adaptations that must be understood within broader socioeconomic contexts.`;

    const faithfulScore = voiceMatchScore(faithful, baseline);
    const offScore = voiceMatchScore(offVoice, baseline);
    expect(faithfulScore.score).toBeGreaterThan(80);
    expect(offScore.score).toBeLessThan(60);
    expect(faithfulScore.signatureHits.length).toBeGreaterThanOrEqual(2);
    expect(offScore.signatureHits.length).toBe(0);
  });

  it("does not punish when the profile has no signature phrases", () => {
    const bare = buildVoiceBaseline([TRANSCRIPT], null);
    const report = voiceMatchScore(CLEAN_HUMAN, bare);
    expect(report.components.signaturePhrases).toBe(100);
  });
});

describe("splitSentences", () => {
  it("splits on terminal punctuation", () => {
    expect(splitSentences("One here. Two there! Three now? Four.").length).toBe(4);
  });
});
