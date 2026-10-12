import type { MessageKey } from "../i18n";

// GameEnded reasons worth explaining, mapped to their message key. "finished"
// is deliberately absent from both this map and the generic fallback: a round
// ending because someone tapped "play again" needs no announcement, and the
// lobby it returns to is explanation enough.
const EXPLAINED: Record<string, MessageKey> = {
  player_left: "gameEnd.player_left",
  imposter_left: "gameEnd.imposter_left",
};

/** The message key explaining why a round stopped, or null if it doesn't want
 * explaining.
 *
 * An unrecognized reason gets the generic line rather than nothing: the wire
 * contract says a game may define its own reasons, so a newer server can send
 * one this build has never heard of, and "the round ended" beats a screen that
 * silently jumps back to the lobby. */
export function endReasonKey(reason: string): MessageKey | null {
  if (reason === "finished") return null;
  return EXPLAINED[reason] ?? "gameEnd.generic";
}
