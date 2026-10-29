import type { MessageKey, Vars } from "../../i18n";
import { displayNameOf } from "../../displayName";
import type { GameViewProps } from "../registry";

type Translate = (key: MessageKey, vars?: Vars) => string;

/** Build a name lookup for one render pass.
 *
 * A round survives a player leaving (see the server's imposter/leave.go), so
 * ids that are no longer on the roster keep turning up: a departed player's
 * clue stays in the recap, and the vote tally can still name them. Those ids
 * resolve from the room's `departed` list and are labelled as having left, so
 * the recap reads "Ben (left): sandy" rather than leaking a raw player id.
 *
 * An id in neither list — a departure older than the connection remembers —
 * gets a generic stand-in. There is deliberately no path that renders an id.
 */
export function makeNameFor(
  players: GameViewProps["players"],
  departed: GameViewProps["departed"],
  t: Translate,
): (id: string) => string {
  return (id) => {
    const here = players.find((p) => p.id === id);
    if (here) return displayNameOf(here.displayName, t);
    const gone = departed.find((p) => p.id === id);
    if (gone) return t("imposter.nameLeft", { name: displayNameOf(gone.displayName, t) });
    return t("imposter.nameGone");
  };
}
