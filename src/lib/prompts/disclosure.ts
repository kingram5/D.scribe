import type { BookReadiness } from "@/lib/copyright-readiness";
import { BAND_LABELS } from "@/lib/copyright-readiness";

export const DISCLOSURE_SYSTEM = `You draft factual first-person AI-use disclosures for an author. You are not a lawyer and you do not give legal advice.

Rules:
- First person ("I", "my").
- Facts only: what was generated, what the author contributed (interview substance, structural choices, edits).
- No legal conclusions. Never say a work is or is not protected, registrable, or owned. Never decide ownership or registration. Never cite statutes as if they decide this book.
- Do not invent chapter contents, quotes, or edit counts. Use only the provenance summary you are given. You will never be given chapter prose — do not ask for it and do not fabricate it.
- If a chapter list is thin or mostly unedited, say so plainly.
- Return ONLY valid JSON with exactly these keys: copyrightOfficeStatement, kdpAnswer.`;

export interface DisclosureProvenance {
  title: string;
  readiness: BookReadiness;
  editTotals: { events: number; substantive: number; cosmetic: number };
}

export function disclosurePrompt(input: DisclosureProvenance): string {
  const { title, readiness, editTotals } = input;
  const chapterLines = readiness.chapters
    .map(
      (c) =>
        `- Chapter ${c.chapterNumber} "${c.title}": band ${c.band} (${BAND_LABELS[c.band]}), editDepth ${c.editDepth.toFixed(2)}, substantiveEdits ${c.substantiveEdits}, cosmeticEdits ${c.cosmeticEdits}`
    )
    .join("\n");

  return `Draft two disclosures for the book ${JSON.stringify(title)}.

PROVENANCE SUMMARY (no chapter prose is included or allowed):
- Book band: ${readiness.band} (${BAND_LABELS[readiness.band]})
- Structure provenance: ${readiness.structure}
- Thin (mostly unedited AI draft) chapters: ${readiness.thinChapters.length ? readiness.thinChapters.join(", ") : "none"}
- Unscored chapters: ${readiness.unscoredChapters.length ? readiness.unscoredChapters.join(", ") : "none"}
- Edit event totals: ${editTotals.events} events (${editTotals.substantive} substantive, ${editTotals.cosmetic} cosmetic)
- Per-chapter bands:
${chapterLines || "- none scored yet"}

Write:
1. copyrightOfficeStatement — a first-person statement identifying AI-generated portions and describing the human contribution (recorded interview substance, any structural choices, and edits). Factual. No legal conclusions.
2. kdpAnswer — the honest Amazon KDP AI-content disclosure selection (almost always that AI was used to create text, unless every chapter is unscored) plus one paragraph explaining how the author used AI and what they changed. Be honest if large parts remain close to the draft.

Return ONLY JSON: {"copyrightOfficeStatement":"...","kdpAnswer":"..."}`;
}
