// Chapter-text formatting markers (2026-08-08). The TipTap editor persists
// block structure and inline emphasis into the plain-text chapter storage:
//   "## Title"  /  "### Title"   headings
//   "> quoted paragraph"          blockquote paragraphs (consecutive = one quote)
//   "**bold**"  "*italic*"  "***both***"
//   "---"                         scene break (predates this file)
// Everything that consumes chapter text goes through here: the editor and the
// PDF/DOCX exporters RENDER the markers; TTS STRIPS them so nothing speaks
// an asterisk out loud.

export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
}

export type Block =
  | { kind: "heading"; level: 2 | 3; runs: Run[] }
  | { kind: "quote"; paragraphs: Run[][] }
  | { kind: "paragraph"; runs: Run[] }
  | { kind: "break" };

export function parseInlineRuns(text: string): Run[] {
  const runs: Run[] = [];
  const re = /\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), bold: false, italic: false });
    if (m[1] != null) runs.push({ text: m[1], bold: true, italic: true });
    else if (m[2] != null) runs.push({ text: m[2], bold: true, italic: false });
    else runs.push({ text: m[3], bold: false, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false, italic: false });
  return runs.length ? runs : [{ text: "", bold: false, italic: false }];
}

export function runsToPlainText(runs: Run[]): string {
  return runs.map((r) => r.text).join("");
}

export function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of content.split(/\n\n+/)) {
    const p = raw.trim();
    if (!p) continue;
    if (p.startsWith("---")) {
      blocks.push({ kind: "break" });
      continue;
    }
    if (p.startsWith("> ")) {
      const runs = parseInlineRuns(p.replace(/^> ?/, "").replace(/\n> ?/g, "\n"));
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === "quote") prev.paragraphs.push(runs);
      else blocks.push({ kind: "quote", paragraphs: [runs] });
      continue;
    }
    if (p.startsWith("### ")) {
      blocks.push({ kind: "heading", level: 3, runs: parseInlineRuns(p.slice(4)) });
      continue;
    }
    if (p.startsWith("## ")) {
      blocks.push({ kind: "heading", level: 2, runs: parseInlineRuns(p.slice(3)) });
      continue;
    }
    blocks.push({ kind: "paragraph", runs: parseInlineRuns(p) });
  }
  return blocks;
}

/** For TTS and any other speech/plain consumer: markers removed, words intact. */
export function stripFormatMarkers(text: string): string {
  return text
    .replace(/^#{2,3} /gm, "")
    .replace(/^> ?/gm, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");
}
