// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PageShell from "@/components/ui/PageShell";
import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { CONSENT_COOKIE } from "@/lib/consent";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
let host: HTMLDivElement, root: Root | null;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ title: "ISOLATED project" }) })));
  localStorage.clear(); sessionStorage.clear();
  document.cookie = `${CONSENT_COOKIE}=; max-age=0; path=/`;
  host = document.createElement("div"); document.body.append(host); root = null;
});
afterEach(async () => { await act(async () => root?.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("hydrates browser-only consent without mismatches and respects an existing choice", async () => {
  host.innerHTML = renderToString(<ConsentBanner />);
  expect(host.innerHTML).toBe("");
  const recover = vi.fn();
  await act(async () => { root = hydrateRoot(host, <ConsentBanner />, { onRecoverableError: recover }); });
  expect(host.querySelector('[aria-label="Cookie consent"]')).not.toBeNull();
  expect(recover).not.toHaveBeenCalled();
  await act(async () => { (host.querySelectorAll("button")[1] as HTMLButtonElement).click(); });
  expect(host.querySelector('[aria-label="Cookie consent"]')).toBeNull();
  await act(async () => root!.unmount()); root = createRoot(host);
  await act(async () => root!.render(<ConsentBanner />));
  expect(host.querySelector('[aria-label="Cookie consent"]')).toBeNull();
});
it("does not overwrite a project's furthest step during hydration or carry it into another project", async () => {
  localStorage.setItem("ds_reached_fixture-a", "6");
  sessionStorage.setItem("ds_title_fixture-a", "ISOLATED cached A");
  const tree = <PageShell projectId="fixture-a" currentStep="upload"><p>Fixture</p></PageShell>;
  host.innerHTML = renderToString(tree);
  const recover = vi.fn();
  await act(async () => { root = hydrateRoot(host, tree, { onRecoverableError: recover }); });
  expect(localStorage.getItem("ds_reached_fixture-a")).toBe("6");
  expect(host.querySelector('a[href="/project/fixture-a/export"]')).not.toBeNull();
  expect(host.textContent).toContain("ISOLATED cached A");
  expect(recover).not.toHaveBeenCalled();
  await act(async () => root!.render(<PageShell projectId="fixture-b" currentStep="upload"><p>Fixture</p></PageShell>));
  expect(localStorage.getItem("ds_reached_fixture-b")).toBe("0");
  expect(host.querySelector('nav[aria-label="Step navigation"] a[href="/project/fixture-b/export"]')).toBeNull();
});
