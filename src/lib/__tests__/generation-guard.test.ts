import { afterEach, describe, expect, it, vi } from "vitest";
import { getGenerationBusy, getNavigationWarning, setGenerationBusy, setUnsavedEdits } from "../generation-guard";
import { createScreenWakeLock } from "../screen-wake-lock";

afterEach(() => { setGenerationBusy(null); setUnsavedEdits(null); vi.unstubAllGlobals(); });
describe("unsaved navigation protection without idle wake locks", () => {
  it("warns for unsaved text while leaving the generation signal idle", () => {
    const windowMock = new EventTarget(); vi.stubGlobal("window", windowMock);
    const request = vi.fn(); const owner = createScreenWakeLock({ request, visible: () => true, onStatus: vi.fn() });
    setUnsavedEdits("Unsaved chapter edits"); owner.setWanted(!!getGenerationBusy());
    expect(getNavigationWarning()).toBe("Unsaved chapter edits"); expect(getGenerationBusy()).toBeNull(); expect(request).not.toHaveBeenCalled();
    const event = new Event("beforeunload", { cancelable: true }); windowMock.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    setGenerationBusy("Draft running"); expect(getGenerationBusy()).toBe("Draft running");
    setGenerationBusy(null); expect(getNavigationWarning()).toBe("Unsaved chapter edits");
    const stillDirty = new Event("beforeunload", { cancelable: true }); windowMock.dispatchEvent(stillDirty); expect(stillDirty.defaultPrevented).toBe(true);
    setUnsavedEdits(null); const clean = new Event("beforeunload", { cancelable: true }); windowMock.dispatchEvent(clean); expect(clean.defaultPrevented).toBe(false);
    owner.dispose();
  });
});
