import { useState } from "react";
import { useT } from "../../../i18n";
import { AnswerForm } from "../AnswerForm";
import { CATEGORIES_PER_ROUND, clueGivers, currentCategory, type LocalEvent, type LocalGame } from "./localGame";

interface Props {
  game: LocalGame;
  /** Which Clue Giver holds the phone, as an index into clueGivers(). */
  giver: number;
  dispatch: (event: LocalEvent) => void;
}

// One Clue Giver's answer, typed in private so nobody's answer can lean on
// anyone else's. The screen opens on a handover step that shows nothing secret,
// because the phone is still travelling across the table when it appears. Only
// once the right person says it's them does the number come up.
//
// Rendered with a key per Clue Giver, so every person starts at the handover with
// an empty box, and the last person's answer is never on screen for the next.
export function AnswerView({ game, giver, dispatch }: Props) {
  const { t } = useT();
  const [ready, setReady] = useState(false);

  const { names, round } = game;
  const givers = clueGivers(game);
  const name = names[givers[giver]];
  const category = currentCategory(round);

  if (!ready) {
    return (
      <main className="screen">
        <div>
          <h1>{t("local.passTo", { who: name })}</h1>
          <p className="status num">{t("wl.giverProgress", { n: giver + 1, total: givers.length })}</p>
        </div>
        <div className="wl-slip wl-slip-down wl-slip-static">
          <span className="wl-slip-note">
            {t("wl.categoryProgress", { n: round.categories.length, total: CATEGORIES_PER_ROUND })}
          </span>
          <span className="wl-slip-prompt">{category}</span>
          <span className="wl-slip-note">{t("wl.onlyYou", { who: name })}</span>
        </div>
        <div className="dock">
          <button className="primary" onClick={() => setReady(true)}>
            {t("wl.iAm", { who: name })}
          </button>
        </div>
      </main>
    );
  }

  return (
    <AnswerForm
      name={name}
      category={category}
      secret={round.secret ?? 0}
      onLock={(text) => dispatch({ type: "submitAnswer", text })}
    />
  );
}
