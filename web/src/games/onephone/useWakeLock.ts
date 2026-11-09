import { useEffect } from "react";

/** Keeps the screen on while `active`, for the stretches when the phone sits on the
 * table untouched: Imposter's auto mode, or a spoken round of Wavelength. A screen
 * that dims after 30 seconds would stop Imposter's turn clock mid-round, and would
 * leave a Wavelength table unlocking the phone just to make the guess.
 *
 * Best effort by design. Plain http and some browsers have no wake lock, and the
 * request can be refused (low battery), in which case the game still works and
 * the screen just sleeps as usual. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    let stopped = false;

    async function acquire() {
      try {
        const next = await navigator.wakeLock.request("screen");
        // The screen may have moved on while the request was in flight.
        if (stopped) void next.release();
        else lock = next;
      } catch {
        lock = null;
      }
    }

    // The browser drops the lock whenever the tab is hidden, so coming back has
    // to ask for it again.
    function onVisible() {
      if (document.visibilityState === "visible") void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}
