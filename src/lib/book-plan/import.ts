import { cleanText } from "./normalize";
import { PLAN_LIMITS } from "./schema";

/**
 * Faithful import of an outline or draft the author already has. Deterministic:
 * no model call, no rewording. Chapter titles and the text under each heading
 * are kept exactly as written (whitespace normalized only). Suggestions, if the
 * user wants them, are a separate operation and are never merged in here.
 */

export interface ImportedChapter {
  title: string;
  /** The author's own text under that heading, verbatim. */
  body: string;
}

export interface ImportedOutline {
  title: string | null;
  chapters: ImportedChapter[];
  /** Text before the first chapter heading (preface, notes). Kept, not dropped. */
  preamble: string;
  /** How the structure was recognized, for the docs and for debugging. */
  detectedBy: "chapter-labels" | "markdown-headings" | "numbered-list" | "single-block";
}

export class ImportTooLargeError extends Error {
  constructor(public readonly chars: number) {
    super(`Import is ${chars} characters; the limit is ${PLAN_LIMITS.maxImportChars}.`);
    this.name = "ImportTooLargeError";
  }
}

const CHAPTER_LABEL = /^\s*(?:#{1,6}\s*)?(?:chapter|ch\.?|part)\s+([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b\s*[:.\-–—)]?\s*(.*)$/i;
const MD_HEADING = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/;
const NUMBERED = /^\s*(\d{1,2})[.)]\s+(.+)$/;

function stripEmphasis(s: string): string {
  return s.replace(/^\*\*(.+)\*\*$/, "$1").replace(/^__(.+)__$/, "$1").trim();
}

function finish(
  title: string | null,
  chapters: ImportedChapter[],
  preamble: string[],
  detectedBy: ImportedOutline["detectedBy"]
): ImportedOutline {
  return {
    title,
    chapters: chapters
      .map((c) => ({ title: c.title.trim(), body: c.body.replace(/\n{3,}/g, "\n\n").trim() }))
      .slice(0, PLAN_LIMITS.maxChapters),
    preamble: preamble.join("\n").trim(),
    detectedBy,
  };
}

export function parseOutline(raw: string): ImportedOutline {
  const text = cleanText(raw ?? "");
  if (text.length > PLAN_LIMITS.maxImportChars) throw new ImportTooLargeError(text.length);
  const lines = text.split("\n");

  // 1) Explicit "Chapter N: Title" labels win: they are the author's own structure.
  if (lines.some((l) => CHAPTER_LABEL.test(stripEmphasis(l)))) {
    let title: string | null = null;
    const pre: string[] = [];
    const chapters: ImportedChapter[] = [];
    for (const line of lines) {
      const m = stripEmphasis(line).match(CHAPTER_LABEL);
      if (m) {
        const rest = stripEmphasis(m[2] ?? "").replace(/^#+\s*/, "");
        chapters.push({ title: rest || `Chapter ${m[1]}`, body: "" });
      } else if (chapters.length) {
        chapters[chapters.length - 1].body += `${line}\n`;
      } else {
        const h = line.match(MD_HEADING);
        if (h && h[1].length === 1 && title === null) title = stripEmphasis(h[2]);
        else pre.push(line);
      }
    }
    return finish(title, chapters, pre, "chapter-labels");
  }

  // 2) Markdown headings. A single H1 is the book title; the next level down is chapters.
  const headings = lines.map((l) => l.match(MD_HEADING)).filter(Boolean) as RegExpMatchArray[];
  if (headings.length) {
    const levels = headings.map((h) => h[1].length);
    const h1Count = levels.filter((l) => l === 1).length;
    const chapterLevel =
      h1Count === 1 && levels.some((l) => l > 1) ? Math.min(...levels.filter((l) => l > 1)) : Math.min(...levels);
    let title: string | null = null;
    const pre: string[] = [];
    const chapters: ImportedChapter[] = [];
    for (const line of lines) {
      const h = line.match(MD_HEADING);
      if (h && h[1].length === chapterLevel) {
        chapters.push({ title: stripEmphasis(h[2]), body: "" });
      } else if (h && h[1].length < chapterLevel && title === null && !chapters.length) {
        title = stripEmphasis(h[2]);
      } else if (chapters.length) {
        chapters[chapters.length - 1].body += `${line}\n`;
      } else {
        pre.push(line);
      }
    }
    if (chapters.length) return finish(title, chapters, pre, "markdown-headings");
  }

  // 3) A top-level numbered list ("1. Title"); indented or bulleted lines below belong to it.
  const numberedTop = lines.filter((l) => NUMBERED.test(l) && !/^\s/.test(l));
  if (numberedTop.length >= 2) {
    const pre: string[] = [];
    const chapters: ImportedChapter[] = [];
    for (const line of lines) {
      const m = !/^\s/.test(line) ? line.match(NUMBERED) : null;
      if (m) chapters.push({ title: stripEmphasis(m[2]), body: "" });
      else if (chapters.length) chapters[chapters.length - 1].body += `${line}\n`;
      else pre.push(line);
    }
    return finish(null, chapters, pre, "numbered-list");
  }

  // 4) No recognizable structure: one chapter holding everything, untouched.
  return finish(null, text ? [{ title: "Untitled chapter", body: text }] : [], [], "single-block");
}
