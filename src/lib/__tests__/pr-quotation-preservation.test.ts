import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/claude-next", () => ({ callClaudeNext: vi.fn(), parseJsonReply: JSON.parse }));
import { callClaudeNext } from "../claude-next";
import { applyEdits, coreFinal } from "../publisher-ready/core";

describe("whole-chapter quotation preservation", () => {
  it.each([
    'Dad said, "We are not selling the farm." Then he left.',
    'Dad said, \u201cWe are not selling the farm.\u201d Then he left.',
    "Dad said, 'We are not selling the farm.' Then he left.",
    'Dad said, \u2018We are not selling the farm.\u2019 Then he left.',
    'Dad said, "We are not selling the farm.',
    '> We are not selling the farm.\n> We will stay.\n\nThen he left.',
  ])("rejects substring edits inside quoted source: %s", (text) => {
    expect(applyEdits(text, [{ find: "not selling", replace: "selling" }])).toEqual({ text, applied: 0, rejected: 1 });
  });
  it("rejects boundary edits, delimiter removal, duplicate quotes, and reordered quotations", () => {
    const text = 'Dad said, "Stay here." Mom said, "Come home."';
    for (const edit of [
      { find: 'said, "Stay', replace: 'said, "Leave' },
      { find: '"Stay here."', replace: 'Stay here.' },
      { find: '"Stay here."', replace: '"Stay here." "Stay here."' },
      { find: text, replace: 'Dad said, "Come home." Mom said, "Stay here."' },
    ]) expect(applyEdits(text, [edit])).toEqual({ text, applied: 0, rejected: 1 });
  });
  it("handles nested quotes, contractions and escaped quotation marks", () => {
    const text = 'She said, \u201cI don\u2019t think he said \'leave\'.\u201d';
    expect(applyEdits(text, [{ find: "leave", replace: "stay" }]).rejected).toBe(1);
    const escaped = 'She said, "He called it \\"not selling\\"."';
    expect(applyEdits(escaped, [{ find: "not selling", replace: "selling" }]).rejected).toBe(1);
    expect(applyEdits("James' book wasn't missing. He waited.", [{ find: "He waited.", replace: "He stayed." }]).applied).toBe(1);
  });
  it("allows surrounding prose edits, even after earlier changes move the quote", () => {
    const text = 'Dad said, "We are not selling the farm." Then he left.';
    const result = applyEdits(text, [
      { find: "Dad said,", replace: "My father said," },
      { find: "not selling", replace: "selling" },
      { find: '"We are not selling the farm." Then he left.', replace: '"We are not selling the farm." He left.' },
    ]);
    expect(result).toEqual({ text: 'My father said, "We are not selling the farm." He left.', applied: 2, rejected: 1 });
  });
  it("final check returns rejected counts and preserves quoted meaning", async () => {
    const text = 'The tapestry is rich, Dad said, "We are not selling the farm."';
    vi.mocked(callClaudeNext).mockResolvedValueOnce({ text: JSON.stringify({ edits: [{ find: "not selling", replace: "selling" }] }), servedBy: "mock", usage: { input_tokens: 0, output_tokens: 0 } });
    const result = await coreFinal(text, {});
    expect(result.text).toBe(text); expect(result.applied).toBe(0); expect(result.rejected).toBe(1);
  });
});
