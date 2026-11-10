import { useT } from "../../../i18n";
import { Standings } from "../Standings";
import { standingsOf } from "./rows";
import { joinNames } from "../../../players/joinNames";
import { leaders, type LocalGame } from "./localGame";

interface Props {
  game: LocalGame;
  onPlayAgain: () => void;
  onChangePlayers: () => void;
}

// Everyone has had their turn as the Psychic. Who won, and the way into another
// game with the same table or a different one.
export function FinalView({ game, onPlayAgain, onChangePlayers }: Props) {
  const { locale, t } = useT();
  const top = leaders(game.scores).map((seat) => game.names[seat]);

  return (
    <main className="screen">
      <div>
        <p className="status">{t("wl.finalHeading")}</p>
        <h1 className="wl-headline">
          {top.length === 1
            ? t("wl.finalWinner", { who: top[0] })
            : t("wl.finalTie", { who: joinNames(top, locale) })}
        </h1>
      </div>

      <Standings rows={standingsOf(game.names, game.scores)} />

      <div className="dock">
        <button className="primary" onClick={onPlayAgain}>
          {t("local.playAgain")}
        </button>
        <button className="secondary" onClick={onChangePlayers}>
          {t("local.changePlayers")}
        </button>
      </div>
    </main>
  );
}
