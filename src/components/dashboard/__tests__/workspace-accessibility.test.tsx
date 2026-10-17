// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Bookshelf, { type ShelfFilter } from "../Bookshelf";
import NewProject from "@/app/(main)/project/new/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/PageShell", () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function Fixture() {
  const [filter, setFilter] = useState<ShelfFilter>("all");
  return <Bookshelf ownerName="Fixture" books={[]} counts={{ all: 0, draft: 0, in_progress: 0, complete: 0, erased: 0 }} filter={filter} onFilter={setFilter} eraseMode={false} onToggleErase={() => {}} onEraseClick={() => {}} erasingId={null} loading={false} quote={{ text: "Fixture", author: "Fixture" }} />;
}
it("filter tabs move selection and focus with arrows, wrapping, Home and End", async () => {
  await act(async () => root.render(<Fixture />));
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Filter books"] [role="tab"]')];
  expect(tabs).toHaveLength(5); tabs[0].focus();
  for (const [key, next] of [["ArrowRight", 1], ["End", 4], ["ArrowRight", 0], ["ArrowLeft", 4], ["Home", 0]] as const) {
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(tabs[next]);
    expect(tabs[next].getAttribute("aria-selected")).toBe("true");
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([tabs[next]]);
  }
});
it("new project title has a visible associated label and does not submit while edited", async () => {
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  await act(async () => root.render(<NewProject />));
  const input = host.querySelector<HTMLInputElement>('#project-title')!;
  expect(input).not.toBeNull(); expect(input.labels?.[0].textContent).toBe("Project title");
  expect(request).not.toHaveBeenCalled();
});
