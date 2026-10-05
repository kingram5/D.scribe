import {
  PAGE_STYLES,
  isPageStyle,
  isChapterOpening,
  type BookDesign,
} from "@/lib/book-design";
import { Chapter, ChapterContent } from "@/types";
import { parseBlocks, runsToPlainText } from "./format-markers";

interface ExportOptions {
  design?: BookDesign;
  title: string;
  author?: string;
  chapters: (Chapter & { content: ChapterContent })[];
  fontSize?: number;
  lineHeight?: number;
}

export async function generatePDF(options: ExportOptions): Promise<Buffer> {
  const { default: jsPDF } = await import("jspdf");
  const style = isPageStyle(options.design?.page_style)
    ? PAGE_STYLES[options.design.page_style]
    : null;
  const opening = isChapterOpening(options.design?.chapter_opening)
    ? options.design.chapter_opening
    : null;
  const font = style?.pdf ?? "helvetica";
  const {
    title,
    author,
    chapters,
    fontSize = style?.size ?? 12,
    lineHeight = style?.lineHeight ?? 1.5,
  } = options;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = style?.margin ?? 72; // 1 inch
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
    let y: number = margin;

    // Wrap long titles so mobile-authored headings survive export too.
    doc.setFont(font, "bold");
    if (opening === "numeral" && chapter.chapter_number > 0) {
      doc.setFontSize(48);
      doc.text(String(chapter.chapter_number).padStart(2, "0"), margin, y + 30);
      y += 68;
    } else if (!opening) {
      doc.setFontSize(20);
      doc.text(`Chapter ${chapter.chapter_number}`, margin, y);
      y += 30;
    }
    doc.setFontSize(style && options.design?.page_style === "bold" ? 24 : 20);
    for (const line of doc.splitTextToSize(chapter.title, textWidth)) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 28;
    }
    if (opening === "divider") {
      y += 8;
      doc.setLineWidth(0.6);
      const mid = pageWidth / 2;
      doc.line(mid - 42, y, mid - 7, y);
      doc.lines(
        [
          [4, 4],
          [-4, 4],
          [-4, -4],
          [4, -4],
        ],
        mid,
        y - 4,
        [1, 1],
        "S",
        true,
      );
      doc.line(mid + 7, y, mid + 42, y);
      y += 20;
    }
    y += 12;
    doc.setFontSize(fontSize);
    doc.setFont(font, "normal");

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
    let firstParagraph = true;
    for (const block of blocks) {
      if (block.kind === "break") {
        if (y > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text("* * *", margin + textWidth / 2, y, { align: "center" });
        y += lineSpacing * 1.5;
      } else if (block.kind === "heading") {
        doc.setFont(font, "bold");
        doc.setFontSize(block.level === 2 ? 15 : 13);
        y += lineSpacing * 0.5;
        writeLines(runsToPlainText(block.runs), margin, textWidth);
        doc.setFont(font, "normal");
        doc.setFontSize(fontSize);
        y += lineSpacing * 0.25;
      } else if (block.kind === "quote") {
        doc.setFont(font, "italic");
        for (const runs of block.paragraphs) {
          writeLines(runsToPlainText(runs), margin + 24, textWidth - 48);
          y += lineSpacing * 0.25;
        }
        doc.setFont(font, "normal");
        y += lineSpacing * 0.25;
      } else {
        const text = runsToPlainText(block.runs);
        if (
          firstParagraph &&
          opening === "dropcap" &&
          chapter.chapter_number > 0 &&
          text
        ) {
          if (
            y + 3 * lineSpacing >
            doc.internal.pageSize.getHeight() - margin
          ) {
            doc.addPage();
            y = margin;
          }
          const initial = Array.from(text)[0];
          const top = y;
          doc.setFontSize(fontSize * 3.4);
          const initialWidth = doc.getTextWidth(initial) + 6;
          doc.text(initial, margin, top + lineSpacing * 1.6);
          doc.setFontSize(fontSize);
          // Lay out the first three rows beside the initial without changing
          // the source text when a word must wrap mid-word.
          let remaining = text.slice(initial.length);
          for (let row = 0; row < 3 && remaining; row++) {
            const chars = Array.from(remaining);
            let count = 1;
            while (
              count < chars.length &&
              doc.getTextWidth(chars.slice(0, count + 1).join("")) <=
                textWidth - initialWidth
            )
              count++;
            let line = chars.slice(0, count).join("");
            const space = line.lastIndexOf(" ");
            if (count < chars.length && space > 0) line = line.slice(0, space);
            doc.text(line, margin + initialWidth, y);
            remaining = remaining.slice(line.length).trimStart();
            y += lineSpacing;
          }
          if (remaining) writeLines(remaining, margin, textWidth);
          y = Math.max(y, top + lineSpacing * 3);
        } else {
          writeLines(text, margin, textWidth);
        }
        firstParagraph = false;
        y += style?.gap ?? lineSpacing * 0.5; // paragraph spacing
      }
    }
  }

  return Buffer.from(doc.output("arraybuffer"));
}
