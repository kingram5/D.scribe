import { Chapter, ChapterContent } from "@/types";
import { parseBlocks, runsToPlainText } from "./format-markers";

interface ExportOptions {
  title: string;
  author?: string;
  chapters: (Chapter & { content: ChapterContent })[];
  fontSize?: number;
  lineHeight?: number;
}

export async function generatePDF(options: ExportOptions): Promise<Buffer> {
  const { default: jsPDF } = await import("jspdf");
  const {
    title,
    author,
    chapters,
    fontSize = 12,
    lineHeight = 1.5,
  } = options;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 72; // 1 inch
  const textWidth = pageWidth - margin * 2;
  const lineSpacing = fontSize * lineHeight;

  // Title page
  doc.setFontSize(28);
  doc.text(title, pageWidth / 2, 300, { align: "center" });
  if (author) {
    doc.setFontSize(16);
    doc.text(author, pageWidth / 2, 350, { align: "center" });
  }

  // Chapters
  for (const chapter of chapters) {
    doc.addPage();
    let y = margin;

    // Chapter title
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(`Chapter ${chapter.chapter_number}`, margin, y);
    y += 30;
    doc.text(chapter.title, margin, y);
    y += 40;

    // Chapter content
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", "normal");

    // Chapter text carries formatting markers (headings, quotes, emphasis —
    // see src/lib/export/format-markers.ts). Render block structure; inline
    // emphasis is flattened to plain text in the PDF (jsPDF has no per-run
    // styling within wrapped lines) so no marker symbols ever leak into print.
    const writeLines = (txt: string, x: number, width: number) => {
      const lines = doc.splitTextToSize(txt, width);
      for (const line of lines) {
        if (y > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, x, y);
        y += lineSpacing;
      }
    };
    const blocks = parseBlocks(chapter.content.content);
    for (const block of blocks) {
      if (block.kind === "break") {
        if (y > doc.internal.pageSize.getHeight() - margin) { doc.addPage(); y = margin; }
        doc.text("* * *", margin + textWidth / 2, y, { align: "center" });
        y += lineSpacing * 1.5;
      } else if (block.kind === "heading") {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(block.level === 2 ? 15 : 13);
        y += lineSpacing * 0.5;
        writeLines(runsToPlainText(block.runs), margin, textWidth);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(fontSize);
        y += lineSpacing * 0.25;
      } else if (block.kind === "quote") {
        doc.setFont("helvetica", "italic");
        for (const runs of block.paragraphs) {
          writeLines(runsToPlainText(runs), margin + 24, textWidth - 48);
          y += lineSpacing * 0.25;
        }
        doc.setFont("helvetica", "normal");
        y += lineSpacing * 0.25;
      } else {
        writeLines(runsToPlainText(block.runs), margin, textWidth);
        y += lineSpacing * 0.5; // paragraph spacing
      }
    }
  }

  return Buffer.from(doc.output("arraybuffer"));
}
