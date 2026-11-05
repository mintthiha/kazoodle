import { useT } from "../../../i18n";
import { Standings } from "./Standings";
import { joinNames } from "./names";
import { clueGivers, psychicWon, roundPoints, totalRounds, type LocalGame } from "./localGame";

interface Props {
  game: LocalGame;
  onNext: () => void;
}

// The secret comes out: the real number beside the Psychic's guess, who won the
// round, and the running scores.
export function ResultView({ game, onNext }: Props) {
  const { locale, t } = useT();
  const { names, round } = game;
  // The guess and the secret are always set by the time a round reaches its
  // result. The fallbacks only keep TypeScript honest about a shape it can't see.
  const guess = round.guess ?? 0;
  const secret = round.secret ?? 0;
  const won = psychicWon(round);
  const givers = clueGivers(game);
  const psychic = names[round.psychic];
  const lastRound = game.roundIndex + 1 >= totalRounds(game);

  const points = won
    ? t("wl.pointsPsychic", { n: givers.length, who: psychic })
    : `${t("wl.offBy", { n: Math.abs(guess - secret) })} ${t("wl.pointsGivers", {
        who: joinNames(
          givers.map((seat) => names[seat]),
          locale,
        ),
      })}`;

  return (
    <main className="screen wl-result">
      <h1 className="wl-headline">{won ? t("wl.psychicWon", { who: psychic }) : t("wl.giversWon")}</h1>

      <div className="wl-reveal">
        <div className="wl-reveal-card wl-reveal-secret">
          <span className="wl-reveal-label">{t("wl.theNumber")}</span>
          <span className="wl-reveal-number num">
            <mark>{secret}</mark>
          </span>
        </div>
        <div className="wl-reveal-card wl-reveal-guess" data-hit={won}>
          <span className="wl-reveal-label">{t("wl.resultGuess", { who: psychic })}</span>
          <span className="wl-reveal-number num">{guess}</span>
        </div>
      </div>

      <p className="wl-lead">{points}</p>

      <Standings names={names} scores={game.scores} deltas={roundPoints(game, guess)} />

      <div className="dock">
        <button className="primary" onClick={onNext}>
          {lastRound ? t("wl.finalScores") : t("wl.nextRound", { who: names[game.roundIndex + 1] })}
        </button>
      </div>
    </main>
  );
}
