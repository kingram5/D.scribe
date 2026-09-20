/**
 * What a chapter needs before anyone can write it.
 *
 * Theo can go deep for an hour and still leave the drafter with nothing to
 * open a chapter on. This is the list he interviews FOR. It is private: the
 * author never hears the word "ingredient" and Theo never names a chapter.
 * The studio shows captured ones as quiet chips so the author can watch a
 * book forming.
 *
 * Weights rank what a drafter cannot invent (a scene, a named person, a number,
 * something someone actually said, the author's own line) above what it can
 * structure on its own.
 */

export interface Ingredient {
  id: string;
  /** Shown to the author on a chip once captured. Plain words. */
  chip: string;
  /** What Theo is told is missing. */
  need: string;
  /** How to tell it has been captured. Read by the note-taker. */
  test: string;
  weight: number;
}

const CORE: Ingredient[] = [
  { id: "scene", chip: "A scene", need: "a scene you could film: a place, a time, who was there", test: "The author described a specific moment with a place or time AND at least one person or physical detail.", weight: 10 },
  { id: "dialogue", chip: "Something someone said", need: "something someone actually said, in their words", test: "The author reported actual words spoken by themselves or another person.", weight: 8 },
  { id: "claim", chip: "The big claim", need: "the claim this book makes, in one sentence", test: "The author stated the book's central argument or message plainly.", weight: 8 },
  { id: "turn", chip: "A turning point", need: "the moment something changed for them", test: "The author described a before and an after: a decision, a failure, a realisation that changed what they did.", weight: 8 },
  { id: "reader", chip: "Who it's for", need: "exactly who needs this book, ideally one real person", test: "The author named or described a specific reader, not a demographic.", weight: 6 },
];

const BY_FAMILY: Record<string, Ingredient[]> = {
  prescriptive: [
    { id: "number", chip: "A real number", need: "a number that moved, from what to what", test: "The author gave a concrete figure, amount, percentage or timeframe from their own experience.", weight: 8 },
    { id: "method", chip: "The method", need: "their method, step by step", test: "The author laid out the steps or parts of their approach in order.", weight: 7 },
    { id: "failure", chip: "A time it failed", need: "a time they or their method failed", test: "The author told of their own failure or a case where their approach did not work.", weight: 7 },
    { id: "objection", chip: "The pushback", need: "what a skeptic would say, and their answer", test: "The author named an objection or a common belief they disagree with.", weight: 6 },
    { id: "action", chip: "What the reader does next", need: "what the reader should do this week", test: "The author gave a concrete action a reader could take.", weight: 5 },
  ],
  faith: [
    { id: "scripture", chip: "The anchoring scripture", need: "the passage that anchors this, with how they came to it", test: "The author cited a scripture reference tied to their point.", weight: 8 },
    { id: "outside-pew", chip: "The reader outside the pew", need: "the person who will read this and never sat in their church", test: "The author described a reader beyond their own congregation or audience.", weight: 7 },
    { id: "unsaid", chip: "What the pulpit left out", need: "what they left out when they preached it", test: "The author shared something personal or difficult they did not say publicly.", weight: 7 },
    { id: "struggle", chip: "Their own struggle with it", need: "their own doubt or failure with this truth", test: "The author admitted a personal struggle, doubt or failure related to the message.", weight: 7 },
    { id: "practice", chip: "How to live it", need: "what living this looks like on a Tuesday", test: "The author named a concrete practice, habit or prayer.", weight: 5 },
  ],
  memoir: [
    { id: "senses", chip: "What it looked and smelled like", need: "one physical detail: a smell, a sound, what the room looked like", test: "The author gave a sensory detail from a specific memory.", weight: 8 },
    { id: "people", chip: "The people", need: "who was there, by name, and who they were to the author", test: "The author named a person and their relationship.", weight: 8 },
    { id: "when", chip: "When and where", need: "roughly when and where", test: "The author gave a year, age, season or place for a memory.", weight: 6 },
    { id: "after", chip: "What happened next", need: "what happened right after", test: "The author told what followed the key moment.", weight: 6 },
    { id: "meaning", chip: "What it meant", need: "what they know now that they did not know then", test: "The author reflected on what a memory meant, in their own terms.", weight: 5 },
  ],
};

const FAMILY_BY_AUDIENCE: Record<string, keyof typeof BY_FAMILY> = {
  "Christian Living": "faith",
  "Faith Community": "faith",
  "Memoir & Biography": "memoir",
};

export function ingredientsFor(audience: string | null | undefined): Ingredient[] {
  const family = (audience && FAMILY_BY_AUDIENCE[audience]) || "prescriptive";
  return [...CORE, ...BY_FAMILY[family]];
}

/** Missing ingredients, most valuable first. */
export function ledgerGaps(audience: string | null | undefined, captured: string[]): Ingredient[] {
  const have = new Set(captured);
  return ingredientsFor(audience).filter((i) => !have.has(i.id)).sort((a, b) => b.weight - a.weight);
}

/** Chips for the studio, in the order they were captured. */
export function capturedChips(audience: string | null | undefined, captured: string[]): { id: string; chip: string }[] {
  const byId = new Map(ingredientsFor(audience).map((i) => [i.id, i]));
  return captured.flatMap((id) => (byId.has(id) ? [{ id, chip: byId.get(id)!.chip }] : []));
}
