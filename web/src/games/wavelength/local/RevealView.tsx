import { useT } from "../../../i18n";
import { Board } from "../Board";
import { boardOf } from "./rows";
import { CATEGORIES_PER_ROUND, currentCategory, type LocalGame } from "./localGame";

interface Props {
  game: LocalGame;
  onContinue: () => void;
}

// The phone goes back on the table: everyone, the Psychic included, reads what
// the Clue Givers said for the category just asked.
export function RevealView({ game, onContinue }: Props) {
  const { t } = useT();
  const { names, round } = game;
  const more = round.categories.length < CATEGORIES_PER_ROUND;

  return (
    <main className="screen">
      <div>
        <p className="status">{t("wl.answersIn")}</p>
        <h1 className="wl-headline">{currentCategory(round)}</h1>
      </div>

      <Board categories={boardOf(game)} freshNewest />

      <div className="dock">
        <button className="primary" onClick={onContinue}>
          {more ? t("wl.nextCategory") : t("wl.toGuess", { who: names[round.psychic] })}
        </button>
      </div>
    </main>
  );
}
