import { useT } from "../../../i18n";
import { ResultShow } from "../ResultShow";
import { joinNames } from "../../../players/joinNames";
import { standingsOf } from "./rows";
import { clueGivers, psychicWon, roundPoints, totalRounds, type LocalGame } from "./localGame";

interface Props {
  game: LocalGame;
  onNext: () => void;
}

// The end of a one-phone round: the shared reveal, fed from this phone's state.
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
    <ResultShow
      psychic={psychic}
      guess={guess}
      secret={secret}
      won={won}
      pointsLine={points}
      rows={standingsOf(names, game.scores, roundPoints(game, guess))}
      actions={
        <button className="wl-vs-next" onClick={onNext}>
          {lastRound ? t("wl.finalScores") : t("wl.nextRound", { who: names[game.roundIndex + 1] })}
        </button>
      }
    />
  );
}
