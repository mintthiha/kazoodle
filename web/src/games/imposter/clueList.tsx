import type { ClueEntry } from "./gen/imposter_pb";
import type { MessageKey } from "../../i18n";

/** The clues given so far, as both the clue screen and the ballot show them.
 * One component, because a clue that reads one way while giving clues and
 * another way while voting is how a recap starts lying.
 *
 * An entry with empty text is a turn whose clock ran out — the server records
 * the miss rather than skipping it, so that stalling is visible to the table
 * instead of being free. */
export function ClueList({
  clues,
  name,
  t,
}: {
  clues: ClueEntry[];
  name: (id: string) => string;
  t: (key: MessageKey) => string;
}) {
  return (
    <ul className="players">
      {clues.map((c, i) => (
        <li key={i}>
          <strong>{name(c.playerId)}:</strong>{" "}
          {c.text ? c.text : <em className="missed-clue">{t("imposter.missedClue")}</em>}
        </li>
      ))}
    </ul>
  );
}
