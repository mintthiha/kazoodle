import { useT } from "../../i18n";
import type { Outcome, VoteTally } from "./gen/imposter_pb";
import type { GameViewProps } from "../registry";
import { makeNameFor } from "./nameFor";

interface Props extends GameViewProps {
  tally: VoteTally | null;
  outcome: Outcome | null;
  isHost: boolean;
  onPlayAgain: () => void;
}

// The final screen: who won, who the imposter was, the word, the steal
// attempt (if there was one), and the vote breakdown. The host gets a "play
// again" button; everyone else just waits for it.
export function OutcomeView({ tally, outcome, players, departed, isHost, onPlayAgain }: Props) {
  const { t } = useT();

  const name = makeNameFor(players, departed, t);

  if (!outcome) {
    return (
      <main className="screen">
        <p className="status">{t("imposter.dealing")}</p>
      </main>
    );
  }

  return (
    <main className="screen">
      <h1>{t("imposter.outcomeHeading")}</h1>

      <section className={`role-card ${outcome.crewWon ? "role-crew" : "role-imposter"}`}>
        <p className="role-word">{outcome.crewWon ? t("imposter.crewWon") : t("imposter.imposterWon")}</p>
        <p className="role-hint">
          {t("imposter.revealImposter", { who: name(outcome.imposterId) })}
        </p>
        <p className="role-hint">
          {t("imposter.revealWord", { word: outcome.word, category: outcome.category })}
        </p>
        {outcome.hint && (
          <p className="role-hint">{t("imposter.revealHint", { hint: outcome.hint })}</p>
        )}
        <p className="role-hint">
          {outcome.votedOutId
            ? t("imposter.votedOut", { who: name(outcome.votedOutId) })
            : t("imposter.noOneVotedOut")}
        </p>
        {outcome.stealAttempted && (
          <p className="role-hint">
            {t(outcome.stealCorrect ? "imposter.stealSucceeded" : "imposter.stealFailed", {
              who: name(outcome.imposterId),
              guess: outcome.stealGuess,
            })}
          </p>
        )}
      </section>

      {tally && (
        <section>
          <h2>{t("imposter.votesHeading")}</h2>
          <ul className="players">
            {tally.counts.map((c) => (
              <li key={c.playerId}>
                {name(c.playerId)} — {c.votes}
              </li>
            ))}
            {tally.abstainCount > 0 && (
              <li>
                {t("imposter.abstain")} — {tally.abstainCount}
              </li>
            )}
          </ul>
        </section>
      )}

      {isHost ? (
        <button className="primary" onClick={onPlayAgain}>
          {t("imposter.playAgain")}
        </button>
      ) : (
        <p className="status">{t("imposter.waitingForHost")}</p>
      )}
    </main>
  );
}
