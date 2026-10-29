import type { MessageKey, Vars } from "./i18n";

type Translate = (key: MessageKey, vars?: Vars) => string;

/** A player's name as it should appear on screen.
 *
 * The server names anyone who joins without one ("Guest-7K3MP"), so an empty
 * name should not reach a screen at all. This exists for the cases where it
 * does anyway: a room still holding someone who joined before guest naming
 * existed, or any future path that forgets. Rendering an empty string is the
 * worst outcome — a roster row that is simply blank reads as a bug in the
 * app, and in Imposter it would be a ballot entry nobody can identify.
 *
 * Shared by the lobby and the game views so both say the same thing. */
export function displayNameOf(name: string, t: Translate): string {
  return name.trim() ? name : t("player.unnamed");
}
