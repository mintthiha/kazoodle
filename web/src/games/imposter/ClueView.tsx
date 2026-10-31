import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import type { ClueTurn } from "./gen/imposter_pb";
import type { GameViewProps } from "../registry";
import { makeNameFor } from "./nameFor";
import { ClueList } from "./clueList";
import { useCountdown } from "./useCountdown";

interface Props extends GameViewProps {
  turn: ClueTurn | null;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** Why the server refused the last clue, if it did. */
  error: MessageKey | null;
}

// One clue word per player, in the server-set order. Only the player whose
// turn it is gets an input; everyone else watches the recap grow.
export function ClueView({
  turn,
  value,
  onChange,
  onSubmit,
  error,
  selfId,
  players,
  departed,
}: Props) {
  const { t } = useT();

  const name = makeNameFor(players, departed, t);
  // A new turn, a new pass, or a turn reissued because someone left: each is
  // a fresh clock on the server, so each restarts the display here.
  const secondsLeft = useCountdown(
    turn?.clueSeconds ?? 0,
    turn ? `${turn.playerId}:${turn.cluePass}:${turn.cluesSoFar.length}` : "",
  );

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
      {/* Only worth saying on a round with more than one pass; on a one-pass
          round "pass 1 of 1" is noise. */}
      {turn.totalCluePasses > 1 && (
        <p className="round-badge">
          {t("imposter.cluePass", { pass: turn.cluePass, total: turn.totalCluePasses })}
        </p>
      )}
      <h1>{t("imposter.cluesHeading")}</h1>
      <p className="status">
        {t("imposter.clueProgress", { turn: turn.turnIndex + 1, total: turn.total })}
      </p>
      {/* Advisory only: the server's clock is the one that ends the turn, so
          this can drift or pause with a sleeping phone without affecting the
          round. It stops at zero rather than going negative, because the
          server's timeout may land a moment later. */}
      {secondsLeft !== null && (
        <p className={secondsLeft <= 5 ? "hint" : "status"} role="status">
          {t("imposter.clueCountdown", { n: secondsLeft })}
        </p>
      )}

      <ClueList clues={turn.cluesSoFar} name={name} t={t} />

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
          {/* Above the button, not below: on a phone the keyboard covers the
              bottom of the screen, and a warning nobody sees is no warning. */}
          {error && <p className="hint">{t(error)}</p>}
          <button className="primary" onClick={onSubmit}>
            {t("imposter.submitClue")}
          </button>
        </section>
      ) : (
        <p className="status">{t("imposter.waitingForClue", { who: name(turn.playerId) })}</p>
      )}
    </main>
  );
}
