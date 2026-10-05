export type WakeStatus = "idle" | "requesting" | "active" | "released" | "unavailable";

export interface ScreenLock {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

/** One owner per mounted control. Late requests can never outlive that owner. */
export function createScreenWakeLock(options: {
  request: () => Promise<ScreenLock>;
  visible: () => boolean;
  onStatus: (status: WakeStatus) => void;
}) {
  let wanted = false;
  let disposed = false;
  let lock: ScreenLock | null = null;
  let pending = false;
  let revision = 0;
  const report = (status: WakeStatus) => { if (!disposed) options.onStatus(status); };
  const release = () => {
    const previous = lock;
    lock = null;
    if (previous && !previous.released) void previous.release().catch(() => {});
  };
  const acquire = async () => {
    if (disposed || !wanted || pending || lock || !options.visible()) return;
    pending = true;
    const attempt = revision;
    report("requesting");
    try {
      const next = await options.request();
      if (disposed || !wanted || attempt !== revision || !options.visible()) {
        void next.release().catch(() => {});
        return;
      }
      lock = next;
      next.addEventListener("release", () => {
        if (lock !== next) return;
        lock = null;
        report(wanted ? "released" : "idle");
      });
      if (next.released) { lock = null; report("released"); }
      else report("active");
    } catch {
      if (attempt === revision && wanted) report("unavailable");
    } finally {
      pending = false;
      // A new run may have started while the previous request was resolving.
      if (!disposed && wanted && attempt !== revision) void acquire();
    }
  };
  return {
    setWanted(next: boolean) {
      if (wanted !== next) revision++;
      wanted = next;
      if (!next) { release(); report("idle"); }
      else void acquire();
    },
    visibilityChanged() {
      if (!options.visible()) { revision++; release(); report(wanted ? "released" : "idle"); }
      else void acquire();
    },
    retry() { void acquire(); },
    dispose() { disposed = true; wanted = false; revision++; release(); },
  };
}
