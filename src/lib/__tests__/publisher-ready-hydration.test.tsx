// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CONSENT_COOKIE } from "@/lib/consent";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.stubEnv("NEXT_PUBLIC_PUBLISHER_READY", "true");
const { default: PageShell } = await import("@/components/ui/PageShell");
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
it.each([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 7], [6, 8]])("migrates legacy progress %i to v2 %i before hydration writes", async (legacy, expected) => {
  localStorage.setItem("ds_reached_legacy-fixture", String(legacy));
  expect(localStorage.getItem("ds_reached_v2_legacy-fixture")).toBeNull();
  const tree = <PageShell projectId="legacy-fixture" currentStep="upload"><p>Isolated fixture</p></PageShell>;
  host.innerHTML = renderToString(tree);
  const recover = vi.fn();
  await act(async () => { root = hydrateRoot(host, tree, { onRecoverableError: recover }); });
  expect(localStorage.getItem("ds_reached_legacy-fixture")).toBe(String(legacy));
  expect(localStorage.getItem("ds_reached_v2_legacy-fixture")).toBe(String(expected));
  if (expected === 8) expect(host.querySelector('a[href="/project/legacy-fixture/export"]')).not.toBeNull();
  expect(recover).not.toHaveBeenCalled();
});
