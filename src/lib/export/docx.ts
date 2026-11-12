import {
  PAGE_STYLES,
  isPageStyle,
  isChapterOpening,
  type BookDesign,
} from "@/lib/book-design";
import { Chapter, ChapterContent } from "@/types";
import { parseBlocks } from "./format-markers";

interface ExportOptions {
  design?: BookDesign;
  title: string;
  author?: string;
  chapters: (Chapter & { content: ChapterContent })[];
}

export async function generateDOCX(options: ExportOptions): Promise<Buffer> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    PageBreak,
  } = await import("docx");
  const { title, author, chapters } = options;
  const style =
    options.design && isPageStyle(options.design.page_style)
      ? PAGE_STYLES[options.design.page_style]
      : null;
  const font = style?.font ?? "Georgia";
  const bodySize = (style?.size ?? 12) * 2;
  const opening = isChapterOpening(options.design?.chapter_opening)
    ? options.design.chapter_opening
    : null;

  const children: InstanceType<typeof Paragraph>[] = [];

  // Title page
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "", break: 8 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, bold: true, size: 56, font })],
    }),
  );

  if (author) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: "", break: 2 })] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: author, size: 32, font })],
      }),
    );
  }

  // Chapters
  for (const chapter of chapters) {
    children.push(
      new Paragraph({
        children: [new PageBreak()],
      }),
      ...(opening === "numeral" && chapter.chapter_number > 0
        ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: String(chapter.chapter_number).padStart(2, "0"),
                  size: 96,
                  font,
                }),
              ],
            }),
          ]
        : []),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({
            text: opening
              ? chapter.title
              : `Chapter ${chapter.chapter_number}: ${chapter.title}`,
            bold: true,
            size: options.design?.page_style === "bold" ? 48 : 36,
            font,
          }),
        ],
      }),
      new Paragraph({ children: [new TextRun({ text: "" })] }), // spacer
    );

    // Chapter text carries formatting markers (headings, quotes, emphasis —
    // src/lib/export/format-markers.ts). DOCX gets full fidelity: real heading
    // sizes, indented italic quotes, and bold/italic runs.
    if (opening === "divider")
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 280 },
          children: [new TextRun({ text: "— ◆ —", font })],
        }),
      );
    const blocks = parseBlocks(chapter.content.content);
    let firstParagraph = true;
    for (const block of blocks) {
      if (block.kind === "break") {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 },
            children: [new TextRun({ text: "* * *", size: bodySize, font })],
          }),
        );
      } else if (block.kind === "heading") {
        children.push(
          new Paragraph({
            spacing: { before: 300, after: 200 },
            children: block.runs.map(
              (r) =>
                new TextRun({
                  text: r.text,
                  bold: true,
                  italics: r.italic,
                  size: block.level === 2 ? 32 : 28,
                  font,
                }),
            ),
          }),
        );
      } else if (block.kind === "quote") {
        for (const runs of block.paragraphs) {
          children.push(
            new Paragraph({
              indent: { left: 720, right: 720 },
              spacing: {
                after: (style?.gap ?? 10) * 20,
                ...(style ? { line: Math.round(style.lineHeight * 240) } : {}),
              },
              children: runs.map(
                (r) =>
                  new TextRun({
                    text: r.text,
                    bold: r.bold,
                    italics: true,
                    size: bodySize,
                    font,
                  }),
              ),
            }),
          );
        }
      } else {
        const runs = block.runs.map((r) => ({ ...r }));
        if (
          firstParagraph &&
          opening === "dropcap" &&
          chapter.chapter_number > 0
        ) {
          const first = runs.find((r) => r.text.length > 0);
          if (first) {
            const initial = Array.from(first.text)[0];
            first.text = first.text.slice(initial.length);
            children.push(
              new Paragraph({
                frame: {
                  type: "alignment",
                  alignment: { x: "left", y: "top" },
                  anchor: { horizontal: "text", vertical: "text" },
                  width: 600,
                  height: 720,
                  dropCap: "drop",
                  lines: 3,
                  space: { horizontal: 100, vertical: 0 },
                },
                children: [
                  new TextRun({ text: initial, font, size: bodySize }),
                ],
              }),
            );
          }
        }
        firstParagraph = false;
        children.push(
          new Paragraph({
            spacing: {
              after: (style?.gap ?? 10) * 20,
              ...(style ? { line: Math.round(style.lineHeight * 240) } : {}),
            },
            children: runs.map(
              (r) =>
                new TextRun({
                  text: r.text,
                  bold: r.bold,
                  italics: r.italic,
                  size: bodySize,
                  font,
                }),
            ),
          }),
        );
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: style
          ? {
              page: {
                margin: {
                  top: style.margin * 20,
                  bottom: style.margin * 20,
                  left: style.margin * 20,
                  right: style.margin * 20,
                },
              },
            }
          : undefined,
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
