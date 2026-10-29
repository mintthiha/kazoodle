import { useEffect, useState } from "react";
import type { ClueTurn } from "./gen/imposter_pb";

/** Seconds left on the current clue turn, or null when the round has no clock.
 *
 * This is a display, not a deadline. The server holds the real timer and ends
 * the turn itself, so nothing here submits anything and nothing depends on it
 * being accurate: a phone that sleeps mid-turn wakes with a stale number and
 * then gets the next ClueTurn from the server, which resets it.
 *
 * It restarts whenever a new ClueTurn arrives — a new turn, a new pass, or the
 * same turn reissued because someone left — since each of those is a fresh
 * clock on the server too. */
export function useClueCountdown(turn: ClueTurn | null): number | null {
  const seconds = turn?.clueSeconds ?? 0;
  // The identity of the turn for countdown purposes: who is up, on which pass,
  // after how many clues. Comparing the message object itself would restart
  // the countdown on every re-render.
  const turnKey = turn ? `${turn.playerId}:${turn.cluePass}:${turn.cluesSoFar.length}` : "";

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    setSecondsLeft(seconds > 0 ? seconds : null);
  }, [turnKey, seconds]);

  useEffect(() => {
    // Stop at zero rather than going negative: the server's timeout may land
    // a moment after ours, and "-3" on screen is worse than a held "0".
    if (secondsLeft === null || secondsLeft <= 0) return;
    const id = setTimeout(() => {
      setSecondsLeft((s) => (s === null ? null : s - 1));
    }, 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  return secondsLeft;
}
