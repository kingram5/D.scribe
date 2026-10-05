export const PAGE_STYLES = {
  classic: {
    label: "Classic",
    description: "Timeless serif · traditional spacing",
    font: "Times New Roman",
    css: '"Times New Roman", Times, serif',
    pdf: "times",
    size: 12,
    lineHeight: 1.5,
    margin: 72,
    gap: 10,
  },
  modern: {
    label: "Modern",
    description: "Clean sans serif · generous space",
    font: "Arial",
    css: "Arial, Helvetica, sans-serif",
    pdf: "helvetica",
    size: 11,
    lineHeight: 1.7,
    margin: 66,
    gap: 14,
  },
  warm: {
    label: "Warm",
    description: "Inviting serif · relaxed reading",
    font: "Times New Roman",
    css: '"Times New Roman", Times, serif',
    pdf: "times",
    size: 13,
    lineHeight: 1.65,
    margin: 78,
    gap: 12,
  },
  bold: {
    label: "Bold",
    description: "Strong headings · compact rhythm",
    font: "Arial",
    css: "Arial, Helvetica, sans-serif",
    pdf: "helvetica",
    size: 12,
    lineHeight: 1.4,
    margin: 60,
    gap: 8,
  },
} as const;
export const CHAPTER_OPENINGS = {
  numeral: {
    label: "Large numeral",
    description: "A confident chapter entrance",
  },
  dropcap: { label: "Drop cap", description: "An oversized first letter" },
  minimal: { label: "Minimal", description: "Just the title, beautifully set" },
  divider: {
    label: "Decorative divider",
    description: "A quiet ornamental pause",
  },
} as const;
export type PageStyle = keyof typeof PAGE_STYLES;
export type ChapterOpening = keyof typeof CHAPTER_OPENINGS;
export interface BookDesign {
  page_style?: PageStyle | null;
  chapter_opening?: ChapterOpening | null;
  back_cover_hook?: string | null;
}
export function isPageStyle(value: unknown): value is PageStyle {
  return typeof value === "string" && Object.hasOwn(PAGE_STYLES, value);
}
export function isChapterOpening(value: unknown): value is ChapterOpening {
  return typeof value === "string" && Object.hasOwn(CHAPTER_OPENINGS, value);
}
export function validDesignPatch(body: Record<string, unknown>): boolean {
  return (
    (!("page_style" in body) ||
      body.page_style === null ||
      isPageStyle(body.page_style)) &&
    (!("chapter_opening" in body) ||
      body.chapter_opening === null ||
      isChapterOpening(body.chapter_opening)) &&
    (!("back_cover_hook" in body) ||
      body.back_cover_hook === null ||
      (typeof body.back_cover_hook === "string" &&
        body.back_cover_hook.length <= 1200))
  );
}
export function parseHooks(text: string): string[] {
  const result: unknown = JSON.parse(text);
  if (
    !Array.isArray(result) ||
    result.length !== 3 ||
    !result.every(
      (h) => typeof h === "string" && h.trim().length >= 30 && h.length <= 1200,
    )
  )
    throw new Error("Invalid hook suggestions");
  const hooks = result.map((h) => (h as string).trim());
  if (new Set(hooks).size !== 3) throw new Error("Duplicate suggestions");
  return hooks;
}
