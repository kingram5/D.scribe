// Audience profiles — one map that specializes the pipeline per target audience.
// Rolled out 2026-08-08 (design: three flagship profiles + a mid-tier template).
//
// THE PRECEDENCE RULE, load-bearing: the audience owns WHAT (which questions get
// asked, what material survives compression, how chapters are structured for the
// reader). The author's voice owns HOW (diction, rhythm, phrasing) via the Voice
// Profile and style memory. Generation directives in this file are CONTENT AND
// STRUCTURE ONLY — a style adjective in a generation directive is a bug, and
// audience-profiles.test.ts enforces that mechanically.

export const AUDIENCES = [
  "General",
  "Christian Living",
  "Faith Community",
  "Leadership",
  "Business & Economics",
  "Self-Help",
  "Personal Development",
  "Health & Wellness",
  "Relationships & Family",
  "Parenting",
  "Memoir & Biography",
  "Lifestyle",
  "Psychology & Motivation",
  "Money & Finance",
  "Young Adult",
  "Academic",
] as const;

export const SCRIPTURE_AUDIENCES = ["Christian Living", "Faith Community"];

/** Offered wherever a scripture audience is chosen — project creation and Structure.
 *  Shared so the two pickers cannot drift apart. */
export const TRANSLATIONS = ["KJV", "NIV", "ESV", "NLT", "NKJV", "NASB", "CSB", "The Message"];

export interface AudienceProfile {
  /** One line: who the brainstorm interviewer is for this genre. */
  persona: string;
  /** Replaces the generic "what do you want to write about today" opener. */
  opener: string;
  /** Genre follow-up patterns the interviewer should reach for. */
  probes: string[];
  /** What "concrete" means in this genre — the bar an answer must clear. */
  specific: string;
  /** What a COMPLETE brainstorm covers, so the interviewer knows where it's going. */
  arc: string;
  /** Never-do rules for the conversation. */
  guardrails: string[];
  /** 3a — what must SURVIVE compression at key-point extraction. */
  preserve: string[];
  /** 3a — chapter-structure guidance for the outline step. */
  outlineShape: string;
  /** 3b — generation content directives. CONTENT/STRUCTURE ONLY, never style. */
  generation: string[];
}

const FLAGSHIP: Record<string, AudienceProfile> = {
  "Money & Finance": {
    persona:
      "You are interviewing an author writing for readers who want to fix or grow their money. Think like a financial editor: numbers, frameworks, and real cases are the currency of this genre.",
    opener:
      "What's the money problem you help people solve, and what do most people get wrong about it?",
    probes: [
      "What's the actual number there?",
      "Walk me through a real example, with dollars.",
      "What's the framework? If you drew it on a napkin, what are the boxes?",
      "What did that mistake cost, and what would doing it right have been worth?",
      "What's the first thing you'd tell someone to do about this on Monday?",
    ],
    specific:
      "An answer is concrete when it contains a number, a named framework, or a step the reader could take this week. 'Save more' is not a point; 'automate 10% before it hits checking' is.",
    arc: "A complete session establishes: the core money claim, exactly who it serves, what those readers currently believe that is wrong, the author's frameworks, the proof stories with real figures, and the objections skeptics will raise.",
    guardrails: [
      "Never supply statistics or figures yourself. Numbers come from the author; if they estimate, keep it marked as their estimate.",
      "This is education, never personalized investment advice. If the author drifts into 'tell the reader exactly what to buy,' steer toward principles and frameworks.",
    ],
    preserve: [
      "Every number, dollar figure, percentage, and timeframe, exactly as stated.",
      "Every named framework, rule, or system, with all of its parts.",
      "Complete worked examples: starting position, actions taken, ending position.",
      "The author's contrarian claims about what conventional advice gets wrong.",
    ],
    outlineShape:
      "Structure chapters problem-first: each opens on a money problem the reader recognizes, builds the author's framework for it, proves it with the author's real examples and figures, and closes on what the reader should do. Sequence from diagnosing the reader's situation toward acting on it.",
    generation: [
      "Open each chapter with the money problem the reader recognizes from their own life, drawn from the source material.",
      "Present the author's frameworks with every component the author gave them; never simplify a framework by dropping parts.",
      "Include the author's real numbers, dollar figures, and worked examples exactly; never invent, round, or update figures.",
      "Close each chapter with the concrete actions the author prescribes, as the author stated them.",
      "Where the author flagged conventional advice as wrong, give that contrast a dedicated passage.",
    ],
  },

  "Christian Living": {
    persona:
      "You are interviewing an author writing to help believers live out their faith. Think like a trusted collaborator on a ministry book: testimony, scripture, and lived application carry this genre.",
    opener:
      "What's the message God has put on your heart for this book, and who needs to hear it most?",
    probes: [
      "Where was God in that moment?",
      "Is there a scripture that anchors this for you?",
      "How did this change how you live, not just what you believe?",
      "What would you say to someone sitting in that same valley right now?",
      "When did this truth stop being theory for you?",
    ],
    specific:
      "An answer is concrete when it contains a testimony moment (a time, a place, a struggle), a scripture anchor, or a lived application a reader could practice.",
    arc: "A complete session establishes: the burden or message of the book, the testimony behind it, its biblical grounding, what living it out looks like practically, and the hope it offers the reader.",
    guardrails: [
      "NEVER fabricate, paraphrase-as-quote, or misattribute scripture. If the author cites a verse, keep the citation (book chapter:verse) exactly as they gave it; if they misremember a reference, ask rather than correct silently.",
      "Stay denominationally neutral unless the author states a tradition; then stay inside it.",
      "Heavy spiritual moments (loss, doubt, crisis) get one gentle follow-up, then let the author steer.",
    ],
    preserve: [
      "Every scripture reference with its citation, and which point it anchors.",
      "Testimony beats intact: the situation, the turning point, where God appeared in it.",
      "The author's applications: the practices, prayers, and habits they prescribe.",
      "The author's own theological phrasings, verbatim where possible.",
    ],
    outlineShape:
      "Structure chapters message-first: each carries one facet of the book's burden, grounds it in the anchoring scripture, walks through the testimony that earned it, and lands on application the reader can live this week. Sequence from the reader's struggle toward hope.",
    generation: [
      "Weave in the scriptures the author cited, quoted from the project's chosen Bible translation, cited book chapter:verse; never introduce verses the author did not bring.",
      "Keep testimony in first person and factually exactly as the author told it.",
      "Give each chapter an application passage built from the practices the author actually named.",
      "Where the author expressed doubt or struggle, keep it; do not resolve tensions the author left open.",
    ],
  },

  "Memoir & Biography": {
    persona:
      "You are interviewing someone telling their life story. Think like a biographer: scenes, people, places, and turning points carry this genre, and the meaning emerges from them.",
    opener:
      "Let's start wherever the story pulls you. What moment from your life do you find yourself telling people about most often?",
    probes: [
      "What did the room look like? What do you remember seeing or smelling?",
      "Who else was there, and what did they say?",
      "When was this, roughly, and where?",
      "What did you know by the end of that day that you didn't know at the start?",
      "What happened right after?",
    ],
    specific:
      "An answer is concrete when you could film it: a place, a time, the people present, and at least one sensory detail. 'My childhood was hard' is a theme; 'the winter the heat got shut off in the Decatur house' is a scene.",
    arc: "A complete session establishes: the anchor moments the teller returns to, the eras around them, the people who mattered, the turning points, and what the teller believes it all meant.",
    guardrails: [
      "Never invent or embellish details. If the teller is unsure, keep it as their recollection ('as I remember it') rather than pressing for certainty.",
      "Real names are sensitive. Note them faithfully; whether they appear in the book is the author's later decision, not the interview's.",
      "When a heavy memory opens (loss, harm, regret), ask one gentle follow-up, then let the teller steer. Never chase trauma for material.",
      "Follow emotional threads across eras rather than forcing chronology; offer era anchors only when the teller stalls.",
    ],
    preserve: [
      "Every scene with its place, time, people present, and sensory details.",
      "Every named person and their relationship to the teller.",
      "Chronology markers (years, ages, seasons, 'right after the wedding') exactly as given.",
      "The teller's own phrases when they said something perfectly — mark these verbatim.",
      "Uncertainty markers ('I think', 'as I remember it') — they are part of the record, not noise.",
    ],
    outlineShape:
      "Structure chapters scene-first, not topic-first: each chapter is built around one or more anchor scenes, with reflection emerging from the scene rather than replacing it. Sequence for narrative pull (chronological or thematic as the material demands), opening on a scene that drops the reader into the life, closing on what it all meant in the teller's own terms.",
    generation: [
      "Narrate scene-first: ground each chapter in the specific scenes from the source material, with their place, time, and people intact.",
      "Never invent details, dialogue, or sensory texture the teller did not provide.",
      "Preserve the teller's uncertainty framing; where they said 'as I remember it,' the chapter says so too.",
      "Keep every named person; never compress people into 'a friend' unless the teller did.",
      "Keep the teller's verbatim-gold phrases word for word.",
      "Let meaning emerge at chapter ends in the teller's own reflections, drawn from the source material only.",
    ],
  },
};

// Mid-tier template — every non-flagship, non-General audience inherits this with
// the audience name folded in. Solid genre-aware interviewing, upgraded to a full
// profile when usage earns it.
function templateProfile(audience: string): AudienceProfile {
  return {
    persona: `You are interviewing an author writing for the ${audience} reader. Think like that book's editor: your job is to pull out the claims, methods, and stories that reader is paying for.`,
    opener: `What do you want this book to change for your ${audience} reader, and what do you know that they don't yet?`,
    probes: [
      "Give me a real example of that, with the details.",
      "What's the method, step by step?",
      "Who is this NOT for?",
      "What's the story that made you believe this?",
      "What does the reader do differently after this chapter?",
    ],
    specific:
      "An answer is concrete when it contains a real example, a step-by-step method, or a firsthand story. Claims without one of those are still theory.",
    arc: "A complete session establishes: the core claim, exactly who the reader is, what that reader currently gets wrong, the author's method, and the stories that prove it.",
    guardrails: [
      "Never supply facts, statistics, or examples yourself; draw them out of the author.",
    ],
    preserve: [
      "Every named method or framework with all of its steps.",
      "Complete examples and firsthand stories with their details.",
      "The author's claims about what readers currently get wrong.",
    ],
    outlineShape: `Structure chapters around one claim or method each, proven by the author's own examples, sequenced from the ${audience} reader's current situation toward the change the book promises.`,
    generation: [
      "Build each chapter on the claims, methods, and examples in the source material; never pad with generic genre material.",
      "Keep the author's methods complete; never drop steps.",
      "Use only the author's own examples and stories.",
    ],
  };
}

/** Returns the profile for an audience, or null for General/unknown (no conditioning). */
export function getAudienceProfile(audience: string | null | undefined): AudienceProfile | null {
  if (!audience || audience === "General") return null;
  if (FLAGSHIP[audience]) return FLAGSHIP[audience];
  if ((AUDIENCES as readonly string[]).includes(audience)) return templateProfile(audience);
  return null;
}

function scriptureLine(audience: string, translation?: string | null): string {
  if (!SCRIPTURE_AUDIENCES.includes(audience)) return "";
  const t = translation ? ` The project's chosen Bible translation is ${translation}; quote scripture from it.` : "";
  return `\nSCRIPTURE RULE: never fabricate or paraphrase-as-quote scripture; keep citations (book chapter:verse) exactly as the author gives them.${t}`;
}

/** Brainstorm chat: appended to the system prompt. Null = keep generic behavior. */
export function brainstormProfileBlock(
  audience: string | null | undefined,
  translation?: string | null
): string | null {
  const p = getAudienceProfile(audience);
  if (!p) return null;
  return `

AUDIENCE SPECIALIZATION — this project's target audience is "${audience}".
${p.persona}
Open the session with: "${p.opener}" (this replaces the generic opening question)
Reach for follow-ups like: ${p.probes.map((q) => `"${q}"`).join(" · ")}
What counts as specific here: ${p.specific}
Where a complete session ends up: ${p.arc}
${p.guardrails.map((g) => `- ${g}`).join("\n")}${scriptureLine(audience as string, translation)}`;
}

/** Key-point extraction (3a): appended to the extraction prompt so compression keeps what this genre values. */
export function extractionProfileBlock(audience: string | null | undefined): string {
  const p = getAudienceProfile(audience);
  if (!p) return "";
  return `

AUDIENCE PRESERVATION RULES — target audience "${audience}". When extracting and summarizing, the following must SURVIVE into key points and supporting quotes (losing them here loses them from the book):
${p.preserve.map((x) => `- ${x}`).join("\n")}`;
}

/** Outline step (3a): appended to the outline prompt. */
export function outlineProfileBlock(audience: string | null | undefined): string {
  const p = getAudienceProfile(audience);
  if (!p) return "";
  return `

AUDIENCE STRUCTURE GUIDANCE — target audience "${audience}": ${p.outlineShape}`;
}

/** Chapter generation (3b): CONTENT DIRECTIVES ONLY. Voice owns style — stated in the header on purpose. */
export function generationProfileBlock(
  audience: string | null | undefined,
  translation?: string | null
): string {
  const p = getAudienceProfile(audience);
  if (!p) return "";
  return `

AUDIENCE CONTENT DIRECTIVES — target audience "${audience}". These govern WHAT each chapter covers and how it is structured for the reader. They NEVER override the author's voice: the Voice Profile and style memory own all diction, rhythm, and phrasing.
${p.generation.map((d) => `- ${d}`).join("\n")}${scriptureLine(audience as string, translation)}`;
}
