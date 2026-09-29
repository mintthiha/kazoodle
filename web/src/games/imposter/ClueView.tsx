import { useT } from "../../i18n";
import type { ClueTurn } from "./gen/imposter_pb";
import type { GameViewProps } from "../registry";
import { nameFor } from "./nameFor";

interface Props extends GameViewProps {
  turn: ClueTurn | null;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}

// One clue word per player, in the server-set order. Only the player whose
// turn it is gets an input; everyone else watches the recap grow.
export function ClueView({ turn, value, onChange, onSubmit, selfId, players }: Props) {
  const { t } = useT();

  if (!turn) {
    return (
      <main className="screen">
        <p className="status">{t("imposter.dealing")}</p>
      </main>
    );
  }

  const isMyTurn = turn.playerId === selfId;

  return (
    <main className="screen">
      <h1>{t("imposter.cluesHeading")}</h1>
      <p className="status">
        {t("imposter.clueProgress", { turn: turn.turnIndex + 1, total: turn.total })}
      </p>

      <ul className="players">
        {turn.cluesSoFar.map((c, i) => (
          <li key={i}>
            <strong>{nameFor(players, c.playerId)}:</strong> {c.text}
          </li>
        ))}
      </ul>

      {isMyTurn ? (
        <section>
          <label className="field">
            <span>{t("imposter.yourClueLabel")}</span>
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={t("imposter.yourCluePlaceholder")}
              enterKeyHint="send"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") onSubmit();
              }}
            />
          </label>
          <button className="primary" onClick={onSubmit}>
            {t("imposter.submitClue")}
          </button>
        </section>
      ) : (
        <p className="status">{t("imposter.waitingForClue", { who: nameFor(players, turn.playerId) })}</p>
      )}
    </main>
  );
}
