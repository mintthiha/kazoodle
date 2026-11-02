import { useEffect, useRef, useState } from "react";

const TICK_MS = 200;

/** A pausable countdown that calls `onExpire` when it reaches zero, returning the
 * whole seconds left. Unlike the online game's useCountdown, this one is the real
 * deadline: no server is coming to end the turn.
 *
 * Each tick subtracts the time that really passed instead of assuming a tick took
 * TICK_MS. Browsers slow timers in a background tab, and a sleeping phone stops
 * them, so counting ticks would let a 15 second turn stretch to minutes. A phone
 * that wakes up past the deadline just expires this one turn.
 *
 * The caller gives each turn its own React `key`, which remounts this hook with a
 * full clock, so nothing here has to detect a new turn. */
export function useTurnClock(seconds: number, paused: boolean, onExpire: () => void): number {
  const [msLeft, setMsLeft] = useState(seconds * 1000);

  // The newest callback, without restarting the interval whenever the parent
  // re-renders and passes a new function.
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    if (paused) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const spent = now - last;
      last = now;
      setMsLeft((ms) => Math.max(0, ms - spent));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [paused]);

  useEffect(() => {
    if (msLeft <= 0) expire.current();
  }, [msLeft]);

  return Math.ceil(msLeft / 1000);
}
