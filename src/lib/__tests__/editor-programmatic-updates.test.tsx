import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  refs: [] as { current: unknown }[], slot: 0, text: "Saved text",
  update: undefined as undefined | ((arg: { editor: unknown }) => void),
  setContent: vi.fn(), setEditable: vi.fn(),
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useRef(initial: unknown) {
    const slot = fixture.slot++;
    return fixture.refs[slot] ?? (fixture.refs[slot] = { current: initial });
  }, useEffect(callback: () => void) { callback(); }, useImperativeHandle() {} };
});
vi.mock("@tiptap/react", () => {
  const editor = {
    state: { doc: {
      forEach: (visit: (block: unknown) => void) => visit({ type: { name: "paragraph" }, descendants: (visitText: (node: unknown) => void) => visitText({ isText: true, text: fixture.text, marks: [] }) }),
    } },
    commands: { setContent: fixture.setContent }, setEditable: fixture.setEditable,
  };
  fixture.setContent.mockImplementation((_html: string, options: { emitUpdate?: boolean }) => { if (options?.emitUpdate !== false) fixture.update?.({ editor }); });
  fixture.setEditable.mockImplementation((_editable: boolean, emitUpdate?: boolean) => { if (emitUpdate !== false) fixture.update?.({ editor }); });
  return { EditorContent: () => null, useEditor: (options: { onUpdate: typeof fixture.update }) => { fixture.update = options.onUpdate; return editor; } };
});
import TipTapEditor from "@/components/editor/TipTapEditor";

beforeEach(() => { fixture.refs = []; fixture.slot = 0; fixture.text = "Saved text"; fixture.setContent.mockClear(); fixture.setEditable.mockClear(); });
describe("editor programmatic changes", () => {
  it("does not mark loading, chapter changes or read-only changes as author edits, and accepts the next real edit", () => {
    const onChange = vi.fn();
    renderToStaticMarkup(<TipTapEditor content="Saved text" onChange={onChange} />);
    expect(fixture.setEditable).toHaveBeenCalledWith(true, false);
    expect(onChange).not.toHaveBeenCalled();
    fixture.slot = 0;
    renderToStaticMarkup(<TipTapEditor content="Other chapter" editable={false} onChange={onChange} />);
    expect(fixture.setContent).toHaveBeenCalledWith("<p>Other chapter</p>", { emitUpdate: false });
    expect(fixture.setEditable).toHaveBeenLastCalledWith(false, false);
    expect(onChange).not.toHaveBeenCalled();
    // An actual TipTap document update must never be swallowed after a chapter switch.
    fixture.text = "A real author edit";
    fixture.update?.({ editor: { state: { doc: { forEach: (visit: (block: unknown) => void) => visit({ type: { name: "paragraph" }, descendants: (visitText: (node: unknown) => void) => visitText({ isText: true, text: fixture.text, marks: [] }) }) } } } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("A real author edit");
  });
});
