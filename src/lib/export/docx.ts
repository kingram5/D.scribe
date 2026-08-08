import { Chapter, ChapterContent } from "@/types";
import { parseBlocks } from "./format-markers";

interface ExportOptions {
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

  const children: InstanceType<typeof Paragraph>[] = [];

  // Title page
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "", break: 8 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: title, bold: true, size: 56, font: "Georgia" }),
      ],
    })
  );

  if (author) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: "", break: 2 })] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: author, size: 32, font: "Georgia" })],
      })
    );
  }

  // Chapters
  for (const chapter of chapters) {
    children.push(
      new Paragraph({
        children: [new PageBreak()],
      }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({
            text: `Chapter ${chapter.chapter_number}: ${chapter.title}`,
            bold: true,
            size: 36,
            font: "Georgia",
          }),
        ],
      }),
      new Paragraph({ children: [new TextRun({ text: "" })] }) // spacer
    );

    // Chapter text carries formatting markers (headings, quotes, emphasis —
    // src/lib/export/format-markers.ts). DOCX gets full fidelity: real heading
    // sizes, indented italic quotes, and bold/italic runs.
    const blocks = parseBlocks(chapter.content.content);
    for (const block of blocks) {
      if (block.kind === "break") {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 },
            children: [
              new TextRun({ text: "* * *", size: 24, font: "Georgia" }),
            ],
          })
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
                  font: "Georgia",
                })
            ),
          })
        );
      } else if (block.kind === "quote") {
        for (const runs of block.paragraphs) {
          children.push(
            new Paragraph({
              indent: { left: 720, right: 720 },
              spacing: { after: 200 },
              children: runs.map(
                (r) =>
                  new TextRun({
                    text: r.text,
                    bold: r.bold,
                    italics: true,
                    size: 24,
                    font: "Georgia",
                  })
              ),
            })
          );
        }
      } else {
        children.push(
          new Paragraph({
            spacing: { after: 200 },
            children: block.runs.map(
              (r) =>
                new TextRun({
                  text: r.text,
                  bold: r.bold,
                  italics: r.italic,
                  size: 24,
                  font: "Georgia",
                })
            ),
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
