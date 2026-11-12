import { describe, expect, it, vi } from "vitest";
import { createScreenWakeLock, type ScreenLock, type WakeStatus } from "../screen-wake-lock";

function sentinel() {
  let listener = () => {};
  const lock: ScreenLock = {
    released: false,
    release: vi.fn(async () => { lock.released = true; listener(); }),
    addEventListener: (_, callback) => { listener = callback; },
  };
  return lock;
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

describe("screen wake lock ownership", () => {
  it("acquires only for a run and releases when it finishes", async () => {
    const lock = sentinel();
    const request = vi.fn(async () => lock);
    const statuses: WakeStatus[] = [];
    const owner = createScreenWakeLock({ request, visible: () => true, onStatus: s => statuses.push(s) });
    owner.setWanted(false);
    expect(request).not.toHaveBeenCalled();
    owner.setWanted(true);
    owner.setWanted(true);
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe("active");
    owner.setWanted(false);
    expect(lock.release).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe("idle");
  });

  it("releases while hidden and reacquires when visible", async () => {
    let visible = true;
    const first = sentinel();
    const second = sentinel();
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const owner = createScreenWakeLock({ request, visible: () => visible, onStatus: vi.fn() });
    owner.setWanted(true);
    await settle();
    visible = false;
    owner.visibilityChanged();
    expect(first.release).toHaveBeenCalled();
    visible = true;
    owner.visibilityChanged();
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
    owner.dispose();
    expect(second.release).toHaveBeenCalled();
  });

  it("releases a pending request that resolves after unmount", async () => {
    const lock = sentinel();
    let resolve!: (lock: ScreenLock) => void;
    const onStatus = vi.fn();
    const owner = createScreenWakeLock({ request: () => new Promise(r => { resolve = r; }), visible: () => true, onStatus });
    owner.setWanted(true);
    owner.dispose();
    onStatus.mockClear();
    resolve(lock);
    await settle();
    expect(lock.release).toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
  });

  it("reports rejection and retries only when asked", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("NotAllowedError")).mockResolvedValueOnce(sentinel());
    const onStatus = vi.fn();
    const owner = createScreenWakeLock({ request, visible: () => true, onStatus });
    owner.setWanted(true);
    await settle();
    expect(onStatus).toHaveBeenLastCalledWith("unavailable");
    expect(request).toHaveBeenCalledTimes(1);
    owner.retry();
    await settle();
    expect(onStatus).toHaveBeenLastCalledWith("active");
    owner.dispose();
  });

  it("handles stopping and restarting before a request resolves", async () => {
    const obsolete = sentinel();
    const current = sentinel();
    let resolve!: (lock: ScreenLock) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce(current);
    const owner = createScreenWakeLock({ request, visible: () => true, onStatus: vi.fn() });
    owner.setWanted(true);
    owner.setWanted(false);
    owner.setWanted(true);
    resolve(obsolete);
    await settle();
    expect(obsolete.release).toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(2);
    owner.dispose();
    expect(current.release).toHaveBeenCalled();
  });
});
