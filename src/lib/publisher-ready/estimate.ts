/**
 * Up-front Ink estimate for a Publisher-Ready run, so a user never pays for a
 * draft and an editor read and then runs dry before the revise.
 *
 * Model (list prices, 9/27 cost model in the vault spec): vendor $ per chapter
 * ≈ $0.25 fixed (editor thinking, interview turns, beat plan) + $0.20 per
 * 1,000 target words (draft, editor read, revise, final check scale with
 * length). A 40,000-word, 12-chapter book lands near $11, about 1,100 Ink.
 * The draft's share (~$0.005 + $0.03 per 1,000 words, Sonnet 5) drops out
 * when the author keeps their current chapters as the first draft.
 * Replace with measured numbers once the scoreboard has run.
 */

export const INK_PER_VENDOR_DOLLAR = 102; // mirrors ink_meter_settings (027)
const FIXED_PER_CHAPTER_USD = 0.25;
const PER_1K_WORDS_USD = 0.2;
const DRAFT_FIXED_USD = 0.005;
const DRAFT_PER_1K_WORDS_USD = 0.03;

export interface EstimateOpts {
  /** Keep the current chapters as the first draft (drops the draft's share). */
  skipDraft?: boolean;
  /** The First Draft step alone (flow v2: the review is optional, so starting a draft never demands the whole run's Ink). */
  draftOnly?: boolean;
}

export function estimateChapterUsd(targetWords: number, opts: EstimateOpts = {}): number {
  const k = Math.max(500, targetWords) / 1000;
  if (opts.draftOnly) return DRAFT_FIXED_USD + DRAFT_PER_1K_WORDS_USD * k;
  const full = FIXED_PER_CHAPTER_USD + PER_1K_WORDS_USD * k;
  return opts.skipDraft ? full - DRAFT_FIXED_USD - DRAFT_PER_1K_WORDS_USD * k : full;
}

export function estimateRunInk(chapters: { target_word_count: number | null }[], opts: EstimateOpts = {}): number {
  const usd = chapters.reduce((sum, c) => sum + estimateChapterUsd(c.target_word_count ?? 3000, opts), 0);
  return Math.ceil(usd * INK_PER_VENDOR_DOLLAR);
}
