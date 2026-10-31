import { useEffect, useState } from "react";

/** Seconds left on a server-run deadline, or null when there is no clock.
 *
 * This is a display, not a deadline. The server holds the real timer and ends
 * the phase itself, so nothing here submits anything and nothing depends on it
 * being accurate: a phone that sleeps mid-turn wakes with a stale number and
 * the next message from the server resets it.
 *
 * `resetKey` is what counts as "a new clock". It is a string the caller builds
 * from whatever identifies the current turn or phase — comparing the message
 * object itself would restart the countdown on every re-render, since a new
 * object arrives each time.
 *
 * It stops at zero rather than going negative: the server's expiry may land a
 * moment after ours, and "-3" on screen is worse than a held "0". */
export function useCountdown(seconds: number, resetKey: string): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    setSecondsLeft(seconds > 0 ? seconds : null);
  }, [resetKey, seconds]);

  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const id = setTimeout(() => {
      setSecondsLeft((s) => (s === null ? null : s - 1));
    }, 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  return secondsLeft;
}
