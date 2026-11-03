import { useT } from "../../i18n";
import { Avatar } from "../../players/Avatar";
import type { LedgerRow } from "./ledger";

interface Props {
  rows: LedgerRow[];
  /** How many clue slots each row should show, drawn empty until they fill. */
  passes: number;
  selfId: string;
  name: (id: string) => string;
  hue: (id: string) => number;
  /** Whose clue the table is waiting on. */
  activeId?: string;
  /** Rows to label as the imposter, once the round is over and it is no secret. */
  imposterIds?: string[];
  /** Who can be picked, when this ledger is being used as a ballot. */
  candidates?: string[];
  selectedId?: string | null;
  disabled?: boolean;
  onPick?: (id: string) => void;
}

// One row per person, with everything they have said side by side. The same
// component is the clue recap and the ballot, for two reasons: a clue that reads
// one way while giving clues and another way while voting is how a recap starts
// lying, and "who said something off?" is exactly the question you are voting on,
// so the thing you tap should be the evidence itself.
export function ClueLedger({
  rows,
  passes,
  selfId,
  name,
  hue,
  activeId,
  imposterIds,
  candidates,
  selectedId,
  disabled,
  onPick,
}: Props) {
  const { t } = useT();

  return (
    <ul className="ledger">
      {rows.map((row) => {
        const active = row.id === activeId;
        const body = (
          <>
            <Avatar name={name(row.id)} hue={hue(row.id)} />
            <span className="ledger-body">
              <span className="ledger-name">
                {name(row.id)}
                {row.id === selfId && <span className="you"> ({t("lobby.you")})</span>}
                {imposterIds?.includes(row.id) && (
                  <span className="pill ledger-imposter">{t("imposter.recapImposter")}</span>
                )}
              </span>
              <span className="ledger-clues">
                {row.texts.map((text, i) =>
                  text ? (
                    <span key={i} className="clue">
                      {text}
                    </span>
                  ) : (
                    <span key={i} className="clue clue-missed">
                      {t("imposter.missedClue")}
                    </span>
                  ),
                )}
                {/* Slots still to fill. The first one in the active row is the
                    one being typed right now, wherever in the room that is. */}
                {Array.from({ length: Math.max(0, passes - row.texts.length) }, (_, i) => (
                  <span
                    key={i}
                    className={active && i === 0 ? "clue clue-now" : "clue clue-empty"}
                    aria-hidden="true"
                  />
                ))}
              </span>
            </span>
          </>
        );

        return (
          <li key={row.id}>
            {onPick && candidates?.includes(row.id) ? (
              <button
                className="ledger-row"
                aria-pressed={selectedId === row.id}
                disabled={disabled}
                onClick={() => onPick(row.id)}
              >
                {body}
              </button>
            ) : (
              <div
                className="ledger-row"
                data-active={active}
                data-imposter={imposterIds?.includes(row.id) ?? false}
              >
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
