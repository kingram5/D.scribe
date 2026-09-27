/**
 * Up-front Ink estimate for a Publisher-Ready run, so a user never pays for a
 * draft and an editor read and then runs dry before the revise.
 *
 * Model (list prices, 9/27 cost model in the vault spec): vendor $ per chapter
 * ≈ $0.25 fixed (editor thinking, interview turns, beat plan) + $0.20 per
 * 1,000 target words (draft, editor read, revise, final check scale with
 * length). A 40,000-word, 12-chapter book lands near $11, about 1,100 Ink.
 * Replace with measured numbers once the scoreboard has run.
 */

export const INK_PER_VENDOR_DOLLAR = 102; // mirrors ink_meter_settings (027)
const FIXED_PER_CHAPTER_USD = 0.25;
const PER_1K_WORDS_USD = 0.2;

export function estimateChapterUsd(targetWords: number): number {
  return FIXED_PER_CHAPTER_USD + PER_1K_WORDS_USD * (Math.max(500, targetWords) / 1000);
}

export function estimateRunInk(chapters: { target_word_count: number | null }[]): number {
  const usd = chapters.reduce((sum, c) => sum + estimateChapterUsd(c.target_word_count ?? 3000), 0);
  return Math.ceil(usd * INK_PER_VENDOR_DOLLAR);
}
