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
function textToHtml(text: string): string {
  if (!text) return "<p></p>";
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Convert TipTap HTML back to plain text with \n\n paragraph breaks */
function htmlToText(editor: Editor): string {
  // getText() strips all formatting but joins paragraphs with \n\n
  // We walk the doc manually for accurate paragraph separation
  const doc = editor.state.doc;
  const paragraphs: string[] = [];
  doc.forEach((node) => {
    paragraphs.push(node.textContent);
  });
  return paragraphs.join("\n\n");
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
      <div style={{
        padding: "0 24px",
        boxSizing: "border-box",
      }}>
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
        `}</style>
        <EditorContent editor={editor} />
      </div>
    );
  }
);

export default TipTapEditor;
