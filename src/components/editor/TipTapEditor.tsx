"use client";

import {
  useEditor,
  EditorContent,
  Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import {
  useEffect,
  useImperativeHandle,
  forwardRef,
  useRef,
  useCallback,
} from "react";

export interface TipTapSelection {
  text: string;
  from: number;
  to: number;
}

export interface TipTapEditorHandle {
  getEditor: () => Editor | null;
}

interface TipTapEditorProps {
  content: string;
  onChange: (text: string) => void;
  onSelectionChange?: (selection: TipTapSelection | null) => void;
  editable?: boolean;
  placeholder?: string;
}

/** Convert plain text (with \n\n paragraph breaks) to simple HTML paragraphs */
function inlineHtml(text: string): string {
  return text
    .replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

// Stored chapter text carries lightweight formatting markers (see
// src/lib/export/format-markers.ts): ## / ### headings, > quote paragraphs,
// ** and * emphasis. The editor parses them into rich nodes here and
// serializes them back in htmlToText, so formatting finally SURVIVES a
// reload instead of being flattened to plain text.
function textToHtml(text: string): string {
  if (!text) return "<p></p>";
  const out: string[] = [];
  let quoteBuf: string[] = [];
  const flushQuote = () => {
    if (quoteBuf.length) {
      out.push(`<blockquote>${quoteBuf.map((q) => `<p>${q}</p>`).join("")}</blockquote>`);
      quoteBuf = [];
    }
  };
  for (const raw of text.split(/\n\n+/)) {
    const p = raw.trim();
    if (!p) continue;
    if (p.startsWith("> ")) {
      quoteBuf.push(inlineHtml(p.replace(/^> ?/, "").replace(/\n> ?/g, "<br>").replace(/\n/g, "<br>")));
      continue;
    }
    flushQuote();
    if (p.startsWith("### ")) out.push(`<h3>${inlineHtml(p.slice(4))}</h3>`);
    else if (p.startsWith("## ")) out.push(`<h2>${inlineHtml(p.slice(3))}</h2>`);
    else out.push(`<p>${inlineHtml(p.replace(/\n/g, "<br>"))}</p>`);
  }
  flushQuote();
  return out.join("") || "<p></p>";
}

type PMNode = Editor["state"]["doc"];

function inlineMarkdown(block: PMNode): string {
  let out = "";
  block.descendants((n) => {
    if (n.isText && n.text) {
      let t = n.text;
      const names = n.marks.map((m) => m.type.name);
      const bold = names.includes("bold");
      const italic = names.includes("italic");
      if (bold && italic) t = `***${t}***`;
      else if (bold) t = `**${t}**`;
      else if (italic) t = `*${t}*`;
      out += t;
    }
    return true;
  });
  return out;
}

/** Convert TipTap doc back to marked plain text with \n\n paragraph breaks */
function htmlToText(editor: Editor): string {
  const doc = editor.state.doc;
  const parts: string[] = [];
  doc.forEach((node) => {
    if (node.type.name === "heading") {
      parts.push(`${node.attrs.level === 3 ? "###" : "##"} ${inlineMarkdown(node as PMNode)}`);
    } else if (node.type.name === "blockquote") {
      node.forEach((child) => parts.push(`> ${inlineMarkdown(child as PMNode)}`));
    } else {
      parts.push(inlineMarkdown(node as PMNode));
    }
  });
  return parts.join("\n\n");
}

const TipTapEditor = forwardRef<TipTapEditorHandle, TipTapEditorProps>(
  function TipTapEditor(
    {
      content,
      onChange,
      onSelectionChange,
      editable = true,
      placeholder = "Begin writing your chapter here...",
    },
    ref
  ) {
    const skipNextUpdate = useRef(false);

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          // Keep it simple — paragraphs, bold, italic, blockquote, headings
          heading: { levels: [2, 3] },
        }),
        CharacterCount,
        Placeholder.configure({ placeholder }),
      ],
      content: textToHtml(content),
      editable,
      editorProps: {
        attributes: {
          class: "ds-tiptap-editor",
          style: [
            "outline: none",
            "font-family: var(--font-lora), Georgia, serif",
            "font-size: 19px",
            "line-height: 2.1",
            "letter-spacing: 0.01em",
            "color: var(--text-primary)",
            "text-align: justify",
          ].join("; "),
        },
      },
      onUpdate: ({ editor }) => {
        if (skipNextUpdate.current) {
          skipNextUpdate.current = false;
          return;
        }
        onChange(htmlToText(editor));
      },
      onSelectionUpdate: ({ editor }) => {
        const { from, to } = editor.state.selection;
        if (from === to) {
          onSelectionChange?.(null);
          return;
        }
        const text = editor.state.doc.textBetween(from, to, "\n\n");
        onSelectionChange?.({ text, from, to });
      },
    });

    useImperativeHandle(ref, () => ({
      getEditor: () => editor,
    }));

    // Sync content from parent (e.g., chapter switch or rewrite stream)
    const prevContentRef = useRef(content);
    useEffect(() => {
      if (!editor) return;
      if (content === prevContentRef.current) return;
      prevContentRef.current = content;

      // If the incoming content is just the echo of the user's own typing
      // (it already matches what the editor holds), do NOT call setContent —
      // setContent rebuilds the doc and yanks the caret to the end + scrolls,
      // which is the "backspace jumps to the bottom" bug. Only sync genuine
      // external changes (chapter switch, rewrite-stream injection).
      if (htmlToText(editor) === content) return;

      // Avoid triggering onChange when we're setting content programmatically
      skipNextUpdate.current = true;
      editor.commands.setContent(textToHtml(content));
    }, [content, editor]);

    // Sync editable state
    useEffect(() => {
      if (!editor) return;
      editor.setEditable(editable);
    }, [editable, editor]);

    if (!editor) return null;

    return (
      <div
        className="ds-tiptap-wrap"
        style={{
          padding: "0 24px",
          boxSizing: "border-box",
        }}
      >
        {/* Block-level styles: the global reset zeroes margins, which made
            blockquotes render identically to paragraphs — the toolbar's Quote
            button "did nothing" visually. Book-style indent, no border. */}
        <style>{`
          .ds-tiptap-editor blockquote {
            margin: 1.5em 2.5em;
            font-style: italic;
            opacity: 0.88;
          }
          .ds-tiptap-editor h2 {
            font-family: var(--font-playfair), serif;
            font-size: 1.55em;
            font-weight: 600;
            line-height: 1.3;
            margin: 1.4em 0 0.5em;
            text-align: left;
          }
          .ds-tiptap-editor h3 {
            font-family: var(--font-playfair), serif;
            font-size: 1.25em;
            font-weight: 600;
            line-height: 1.3;
            margin: 1.2em 0 0.4em;
            text-align: left;
          }
          @media (max-width: 768px) {
            .ds-tiptap-wrap {
              padding: 0 2px !important;
            }
            .ds-tiptap-editor blockquote {
              margin: 1.25em 1em;
            }
          }
        `}</style>
        <EditorContent editor={editor} />
      </div>
    );
  }
);

export default TipTapEditor;
