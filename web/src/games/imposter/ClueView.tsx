import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { makeHueFor } from "../../players/hues";
import type { ClueTurn, RoleAssignment } from "./gen/imposter_pb";
import type { GameViewProps } from "../registry";
import { makeNameFor } from "./nameFor";
import { ClueLedger } from "./ClueLedger";
import { Countdown } from "./Countdown";
import { buildLedger } from "./ledger";
import { useCountdown } from "./useCountdown";
import { WordPeek } from "./WordSlip";

interface Props extends GameViewProps {
  role: RoleAssignment | null;
  turn: ClueTurn | null;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** Why the server refused the last clue, if it did. */
  error: MessageKey | null;
}

// One clue word per player, in the server-set order. Only the player whose
// turn it is gets an input; everyone else watches the ledger fill in.
export function ClueView({
  role,
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
  const hue = makeHueFor(players, departed);
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
      <div>
        <h1>{isMyTurn ? t("imposter.yourTurn") : t("imposter.waitingForClue", { who: name(turn.playerId) })}</h1>
        <p className="status num">
          {/* Only worth saying on a round with more than one pass; on a one-pass
              round "pass 1 of 1" is noise. */}
          {turn.totalCluePasses > 1 &&
            `${t("imposter.cluePass", { pass: turn.cluePass, total: turn.totalCluePasses })} · `}
          {t("imposter.clueProgress", { turn: turn.turnIndex + 1, total: turn.total })}
        </p>
      </div>

      {/* Advisory only: the server's clock is the one that ends the turn, so
          this can drift or pause with a sleeping phone without affecting the
          round. It stops at zero rather than going negative, because the
          server's timeout may land a moment later. */}
      {secondsLeft !== null && (
        <Countdown
          seconds={secondsLeft}
          total={turn.clueSeconds}
          label={t("imposter.clueCountdown", { n: secondsLeft })}
        />
      )}

      <WordPeek role={role} />

      <ClueLedger
        rows={buildLedger(players.map((p) => p.id), turn.cluesSoFar)}
        passes={turn.totalCluePasses}
        activeId={turn.playerId}
        selfId={selfId}
        name={name}
        hue={hue}
      />

      {isMyTurn && (
        <div className="dock">
          {/* Above the box, not below: on a phone the keyboard covers the bottom
              of the screen, and a warning nobody sees is no warning. */}
          {error && <p className="hint">{t(error)}</p>}
          <label className="field">
            <span>{t("imposter.yourClueLabel")}</span>
            <span className="entry-row">
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
              <button className="primary" onClick={onSubmit}>
                {t("imposter.submitClue")}
              </button>
            </span>
          </label>
        </div>
      )}
    </main>
  );
}
