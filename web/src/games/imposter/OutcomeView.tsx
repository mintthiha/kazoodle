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

// The screen between rounds, and the one at the end of the match: who won the
// round, who the imposter was, the word, the steal attempt (if there was one),
// the vote breakdown, and the standings the round leaves behind.
//
// The host's button moves the match on — "next round", or "finish" on the last
// one. Everyone else waits for them. Which of the two it is comes from the
// server's matchOver flag, never from the client counting rounds itself.
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

  const over = outcome.matchOver;
  const winners = outcome.winnerIds;

  return (
    <main className="screen">
      {outcome.totalRounds > 1 && (
        <p className="round-badge">
          {t("imposter.roundOf", { round: outcome.round, total: outcome.totalRounds })}
        </p>
      )}
      <h1>{over ? t("imposter.finalHeading") : t("imposter.outcomeHeading")}</h1>

      {over && (
        <p className="winner-banner">
          {winners.length === 0
            ? t("imposter.matchNoWinner")
            : winners.length === 1
              ? t("imposter.matchWinner", { who: name(winners[0]) })
              : t("imposter.matchWinnersTie", { who: winners.map(name).join(", ") })}
        </p>
      )}

      <section className={`role-card ${outcome.crewWon ? "role-crew" : "role-imposter"}`}>
        <p className="role-word">
          {outcome.crewWon ? t("imposter.crewWon") : t("imposter.imposterWon")}
        </p>
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

      {/* Standings come down already sorted, best first, with every player
          listed — including anyone who left, who keeps the points they
          earned. */}
      {outcome.scores.length > 0 && (
        <section>
          <h2>{t("imposter.scoresHeading")}</h2>
          <ul className="players scores">
            {outcome.scores.map((s) => (
              <li key={s.playerId} data-winner={over && winners.includes(s.playerId)}>
                <span className="score-name">{name(s.playerId)}</span>
                {s.delta > 0 && (
                  <span className="score-delta">
                    {t("imposter.scoreDelta", { delta: s.delta })}
                  </span>
                )}
                <span className="score-total">{s.score}</span>
              </li>
            ))}
          </ul>
          <p className="status">{t("imposter.scoring")}</p>
        </section>
      )}

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
          {over ? t("imposter.finishMatch") : t("imposter.nextRound")}
        </button>
      ) : (
        <p className="status">
          {over ? t("imposter.waitingForFinish") : t("imposter.waitingForNextRound")}
        </p>
      )}
    </main>
  );
}
