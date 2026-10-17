// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { liveDraftKey, readLiveDraft, writeLiveDraft, setLiveDraftAccount } from "@/lib/live-draft-storage";
const fixture = vi.hoisted(() => ({
  callback: null as null | ((event: string, session: { user: User } | null) => void),
  getSession: vi.fn(), signOut: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ createBrowserClient: () => ({ auth: {
  getSession: fixture.getSession, signOut: fixture.signOut,
  onAuthStateChange: (callback: typeof fixture.callback) => { fixture.callback = callback; return { data: { subscription: { unsubscribe: fixture.unsubscribe } } }; },
} }) }));
vi.mock("@/lib/heycatch", () => ({ identifyUser: vi.fn(), resetIdentity: vi.fn(), trackSignupCompletedOnce: vi.fn() }));
import { useAuth } from "../useAuth";
let root: Root, host: HTMLDivElement;
const user = (id: string) => ({ id } as User);
function Fixture() { const auth = useAuth(); return <><p>{auth.user?.id ?? "signed-out"}</p><button onClick={() => void auth.signOut()}>Sign out</button></>; }
const draft = "ISOLATED author recovery text";
function seed(account: string) {
  setLiveDraftAccount(account);
  writeLiveDraft(account, liveDraftKey(account, "isolated-run"), draft);
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); sessionStorage.clear(); setLiveDraftAccount(null);
  fixture.callback = null; fixture.getSession.mockReset(); fixture.signOut.mockReset();
  fixture.getSession.mockResolvedValue({ data: { session: { user: user("account-a") } } });
  fixture.signOut.mockReturnValue(new Promise(() => {}));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("purges author drafts immediately on explicit sign-out, before its asynchronous SDK request finishes", async () => {
  await act(async () => root.render(<Fixture />)); seed("account-a");
  await act(async () => host.querySelector("button")!.click());
  expect(sessionStorage.getItem(liveDraftKey("account-a", "isolated-run"))).toBeNull();
  expect(writeLiveDraft("account-a", liveDraftKey("account-a", "isolated-run"), draft)).toBe(false);
});
it("purges legacy and current recovery entries on SIGNED_OUT and account changes", async () => {
  await act(async () => root.render(<Fixture />)); seed("account-a");
  sessionStorage.setItem("ds:live-draft:legacy-run", draft);
  await act(async () => fixture.callback!("SIGNED_OUT", null));
  expect(readLiveDraft("account-a", liveDraftKey("account-a", "isolated-run"))).toBe("");
  expect(sessionStorage.getItem("ds:live-draft:legacy-run")).toBeNull();
  await act(async () => fixture.callback!("SIGNED_IN", { user: user("account-a") })); seed("account-a");
  await act(async () => fixture.callback!("SIGNED_IN", { user: user("account-b") }));
  expect(host.querySelector("p")!.textContent).toBe("account-b");
  expect(sessionStorage.getItem(liveDraftKey("account-a", "isolated-run"))).toBeNull();
});
it("preserves same-account recovery on token refresh and rejects reads using another account key", async () => {
  await act(async () => root.render(<Fixture />)); seed("account-a");
  await act(async () => fixture.callback!("TOKEN_REFRESHED", { user: user("account-a") }));
  expect(readLiveDraft("account-a", liveDraftKey("account-a", "isolated-run"))).toBe(draft);
  expect(readLiveDraft("account-b", liveDraftKey("account-a", "isolated-run"))).toBe("");
  sessionStorage.setItem(liveDraftKey("account-b", "isolated-run"), "ISOLATED other-account fixture");
  expect(readLiveDraft("account-a", liveDraftKey("account-b", "isolated-run"))).toBe("");
});
it("ignores an initial getSession result arriving after a newer auth event", async () => {
  let resolve!: (value: { data: { session: { user: User } } }) => void;
  fixture.getSession.mockReturnValue(new Promise((r) => { resolve = r; }));
  await act(async () => root.render(<Fixture />));
  await act(async () => fixture.callback!("SIGNED_IN", { user: user("account-b") })); seed("account-b");
  await act(async () => resolve({ data: { session: { user: user("account-a") } } }));
  expect(host.querySelector("p")!.textContent).toBe("account-b");
  expect(readLiveDraft("account-b", liveDraftKey("account-b", "isolated-run"))).toBe(draft);
});
