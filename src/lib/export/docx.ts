import { Chapter, ChapterContent } from "@/types";

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

    const paragraphs = chapter.content.content.split("\n\n");
    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (!trimmed) continue;

      // Check for section breaks (lines starting with ---)
      if (trimmed.startsWith("---")) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 },
            children: [
              new TextRun({ text: "* * *", size: 24, font: "Georgia" }),
            ],
          })
        );
        continue;
      }

      children.push(
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: trimmed,
              size: 24,
              font: "Georgia",
            }),
          ],
        })
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
