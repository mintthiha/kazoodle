import type { CSSProperties } from "react";
import { useT } from "../../i18n";
import { Avatar } from "../../players/Avatar";
import { makeHueFor } from "../../players/hues";
import type { Outcome, VotePhase, VoteTally } from "./gen/imposter_pb";
import type { GameViewProps } from "../registry";
import { ClueLedger } from "./ClueLedger";
import { buildLedger } from "./ledger";
import { makeNameFor } from "./nameFor";

interface Props extends GameViewProps {
  tally: VoteTally | null;
  outcome: Outcome | null;
  /** Where the clues and the turn order come from: the last ballot of the round. */
  votePhase: VotePhase | null;
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
export function OutcomeView({
  tally,
  outcome,
  votePhase,
  selfId,
  players,
  departed,
  isHost,
  onPlayAgain,
}: Props) {
  const { t } = useT();

  const name = makeNameFor(players, departed, t);
  const hue = makeHueFor(players, departed);

  if (!outcome) {
    return (
      <main className="screen">
        <p className="status">{t("imposter.dealing")}</p>
      </main>
    );
  }

  const over = outcome.matchOver;
  const winners = outcome.winnerIds;
  const imposterIds = outcome.partnerId
    ? [outcome.imposterId, outcome.partnerId]
    : [outcome.imposterId];
  const verdict = outcome.crewWon
    ? t("imposter.crewWon")
    : t(outcome.partnerId ? "imposter.imposterWonPair" : "imposter.imposterWon");
  const votesCast =
    (tally?.counts.reduce((sum, c) => sum + c.votes, 0) ?? 0) + (tally?.abstainCount ?? 0);

  // The names behind one line of the vote, or nothing if there was no ballot list.
  const votersFor = (suspectId: string): string =>
    (tally?.ballots ?? [])
      .filter((b) => b.suspectId === suspectId)
      .map((b) => name(b.voterId))
      .join(", ");

  return (
    <main className="screen">
      {/* The one moment the whole room looks at the same phone, so it gets a
          whole field of colour. At the end of a match the match winner takes the
          title, and this round's verdict drops a level. */}
      {over && (
        <h1 className="match-winner">
          {winners.length === 0
            ? t("imposter.matchNoWinner")
            : winners.length === 1
              ? t("imposter.matchWinner", { who: name(winners[0]) })
              : t("imposter.matchWinnersTie", { who: winners.map(name).join(", ") })}
        </h1>
      )}

      <section className="verdict" data-side={outcome.crewWon ? "crew" : "imposter"}>
        {over ? <h2 className="verdict-line">{verdict}</h2> : <h1 className="verdict-line">{verdict}</h1>}

        <dl className="verdict-facts">
          <div>
            <dt>{t(outcome.partnerId ? "imposter.theImposters" : "imposter.theImposter")}</dt>
            {imposterIds.map((id) => (
              <dd key={id} className="verdict-who">
                <Avatar name={name(id)} hue={hue(id)} />
                {name(id)}
              </dd>
            ))}
          </div>
          <div>
            <dt>{t("imposter.theWord")}</dt>
            <dd className="verdict-word">
              <span className="verdict-slip">{outcome.word}</span>
              <span className="verdict-category">{outcome.category}</span>
            </dd>
          </div>
        </dl>
      </section>

      <div className="story">
        <p>
          {outcome.votedOutId
            ? t("imposter.votedOut", { who: name(outcome.votedOutId) })
            : t("imposter.noOneVotedOut")}
        </p>
        {outcome.stealAttempted && (
          <p>
            {t(outcome.stealCorrect ? "imposter.stealSucceeded" : "imposter.stealFailed", {
              who: name(outcome.votedOutId),
              guess: outcome.stealGuess,
            })}
          </p>
        )}
        {outcome.hint && <p>{t("imposter.revealHint", { hint: outcome.hint })}</p>}
      </div>

      {/* The evidence, now that it can be read knowing the answer. This is where the
          table gets to enjoy the clue that gave somebody away. */}
      {votePhase && votePhase.clues.length > 0 && (
        <section className="recap">
          <h2>{t("imposter.recapHeading")}</h2>
          <ClueLedger
            rows={buildLedger(votePhase.candidateIds, votePhase.clues)}
            passes={0}
            selfId={selfId}
            name={name}
            hue={hue}
            imposterIds={imposterIds}
          />
        </section>
      )}

      {/* Standings come down already sorted, best first, with every player
          listed — including anyone who left, who keeps the points they
          earned. */}
      {outcome.scores.length > 0 && (
        <section>
          <h2>{over ? t("imposter.finalHeading") : t("imposter.scoresHeading")}</h2>
          <ol className="roster standings">
            {outcome.scores.map((s) => (
              <li
                key={s.playerId}
                className="roster-row"
                data-winner={over && winners.includes(s.playerId)}
              >
                <Avatar name={name(s.playerId)} hue={hue(s.playerId)} />
                <span className="roster-name">
                  {name(s.playerId)}
                  {s.delta > 0 && (
                    <span className="score-delta">
                      {t("imposter.scoreDelta", { delta: s.delta })}
                    </span>
                  )}
                </span>
                <span className="score-total num">{s.score}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {tally && (
        <section>
          <h2>{t("imposter.votesHeading")}</h2>
          <ul className="votes">
            {[...tally.counts]
              .sort((a, b) => b.votes - a.votes)
              .map((c) => (
                <VoteRow
                key={c.playerId}
                label={name(c.playerId)}
                votes={c.votes}
                total={votesCast}
                out={c.playerId === tally.votedOutId}
                voters={votersFor(c.playerId)}
              />
            ))}
            {tally.abstainCount > 0 && (
              <VoteRow
                label={t("imposter.abstain")}
                votes={tally.abstainCount}
                total={votesCast}
                voters={votersFor("")}
              />
            )}
          </ul>
        </section>
      )}

      <p className="status scoring-note">{t("imposter.scoring")}</p>

      <div className="dock">
        {isHost ? (
          <button className="primary" onClick={onPlayAgain}>
            {over ? t("imposter.finishMatch") : t("imposter.nextRound")}
          </button>
        ) : (
          <p className="status">
            {over ? t("imposter.waitingForFinish") : t("imposter.waitingForNextRound")}
          </p>
        )}
      </div>
    </main>
  );
}

// One line of the vote: the bar is the true share of the ballots cast, in the
// game's colour only for the person it actually put out.
function VoteRow({
  label,
  votes,
  total,
  out = false,
  voters,
}: {
  label: string;
  votes: number;
  total: number;
  out?: boolean;
  /** Who cast these votes, as one line of names. Empty if the server sent none. */
  voters: string;
}) {
  const { t } = useT();
  const share = total > 0 ? votes / total : 0;
  return (
    <li className="vote-row" data-out={out}>
      <span className="vote-label">{label}</span>
      <span className="vote-count num">{votes}</span>
      <span className="vote-bar" aria-hidden="true">
        <span className="vote-fill" style={{ "--share": share } as CSSProperties} />
      </span>
      {voters && <span className="vote-voters">{t("imposter.votedBy", { who: voters })}</span>}
    </li>
  );
}
