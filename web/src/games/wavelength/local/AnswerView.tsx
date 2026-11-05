import { useState } from "react";
import { useT } from "../../../i18n";
import {
  CATEGORIES_PER_ROUND,
  MAX_ANSWER_LENGTH,
  answerProblem,
  clueGivers,
  currentCategory,
  type LocalEvent,
  type LocalGame,
} from "./localGame";

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
  const [text, setText] = useState("");

  const { names, round } = game;
  const givers = clueGivers(game);
  const name = names[givers[giver]];
  const category = currentCategory(round);
  const problem = answerProblem(text);

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
    <main className="screen">
      <div>
        <p className="status">{name}</p>
        <h1 className="wl-headline">{category}</h1>
      </div>

      <div className="wl-mine">
        <span className="wl-mine-label">{t("wl.yourNumber")}</span>
        <span className="wl-mine-number num">
          <mark>{round.secret}</mark>
        </span>
      </div>
      <div>
        <p className="wl-lead">{t("wl.answerPrompt", { n: round.secret ?? "" })}</p>
        <p className="status local-help">{t("wl.scale")}</p>
      </div>

      <form
        id="wl-answer"
        onSubmit={(e) => {
          e.preventDefault();
          if (problem === null) dispatch({ type: "submitAnswer", text });
        }}
      >
        <label className="field">
          <span>{t("wl.answerLabel")}</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_ANSWER_LENGTH}
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
            autoFocus
          />
        </label>
      </form>
      {problem === "tooLong" && <p className="hint">{t("wl.answerTooLong", { n: MAX_ANSWER_LENGTH })}</p>}

      <div className="dock">
        <button type="submit" form="wl-answer" className="primary" disabled={problem !== null}>
          {t("wl.lockAnswer")}
        </button>
      </div>
    </main>
  );
}
