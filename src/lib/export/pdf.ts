import jsPDF from "jspdf";
import { Chapter, ChapterContent } from "@/types";

interface ExportOptions {
  title: string;
  author?: string;
  chapters: (Chapter & { content: ChapterContent })[];
  fontSize?: number;
  lineHeight?: number;
}

export function generatePDF(options: ExportOptions): Buffer {
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

    const paragraphs = chapter.content.content.split("\n\n");
    for (const paragraph of paragraphs) {
      const lines = doc.splitTextToSize(paragraph.trim(), textWidth);
      for (const line of lines) {
        if (y > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += lineSpacing;
      }
      y += lineSpacing * 0.5; // paragraph spacing
    }
  }

  return Buffer.from(doc.output("arraybuffer"));
}
