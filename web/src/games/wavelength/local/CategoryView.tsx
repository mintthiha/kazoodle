import { useState } from "react";
import { useT, type MessageKey } from "../../../i18n";
import { Board } from "./Board";
import {
  CATEGORIES_PER_ROUND,
  MAX_CATEGORY_LENGTH,
  categoryProblem,
  type LocalEvent,
  type LocalGame,
} from "./localGame";

interface Props {
  game: LocalGame;
  dispatch: (event: LocalEvent) => void;
}

/** Starting points for a Psychic with a blank mind. Any category can be typed. */
const IDEAS: MessageKey[] = [
  "wl.idea.animals",
  "wl.idea.food",
  "wl.idea.movies",
  "wl.idea.cars",
  "wl.idea.countries",
  "wl.idea.celebrities",
  "wl.idea.songs",
  "wl.idea.sports",
  "wl.idea.drinks",
  "wl.idea.tv",
  "wl.idea.holidays",
  "wl.idea.snacks",
];

// The Psychic holds the phone and names the next category. Choosing well is the
// whole skill of the role, so the answers to earlier categories are right here to
// steer the next question.
export function CategoryView({ game, dispatch }: Props) {
  const { t } = useT();
  const [text, setText] = useState("");
  const { names, round } = game;

  const problem = categoryProblem(round, text);
  const asked = new Set(round.categories.map((c) => c.toLocaleLowerCase()));
  const ideas = IDEAS.map((key) => t(key)).filter((label) => !asked.has(label.toLocaleLowerCase()));

  function submit() {
    if (problem === null) dispatch({ type: "setCategory", text });
  }

  return (
    <main className="screen">
      <div>
        <h1>{t("wl.categoryHeading", { who: names[round.psychic] })}</h1>
        <p className="status num">
          {t("wl.categoryProgress", { n: round.categories.length + 1, total: CATEGORIES_PER_ROUND })}
        </p>
      </div>

      <form
        id="wl-category"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span>{t("wl.categoryLabel")}</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("wl.categoryPlaceholder")}
            maxLength={MAX_CATEGORY_LENGTH}
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="send"
          />
        </label>
      </form>
      {problem === "repeated" && <p className="hint">{t("wl.categoryRepeated")}</p>}
      {problem === "tooLong" && <p className="hint">{t("wl.categoryTooLong", { n: MAX_CATEGORY_LENGTH })}</p>}

      <div>
        <p className="wl-ideas-label">{t("wl.ideas")}</p>
        <div className="wl-ideas">
          {ideas.map((label) => (
            <button key={label} className="wl-idea" onClick={() => setText(label)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {round.categories.length > 0 && (
        <section>
          <h2>{t("wl.soFar")}</h2>
          <Board game={game} />
        </section>
      )}

      <div className="dock">
        <button type="submit" form="wl-category" className="primary" disabled={problem !== null}>
          {t("wl.ask")}
        </button>
      </div>
    </main>
  );
}
