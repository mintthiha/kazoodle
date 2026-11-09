import { useState } from "react";
import { useT, type MessageKey } from "../../i18n";
import { Board, type BoardCategory } from "./Board";
import { CATEGORIES_PER_ROUND, MAX_CATEGORY_LENGTH, categoryProblem } from "./local/localGame";

interface Props {
  /** The Psychic's name, for the heading. */
  psychic: string;
  /** Every category answered this round, oldest first. */
  board: BoardCategory[];
  onAsk: (text: string) => void;
  /** A refusal from the server, online only. One-phone has no server to refuse. */
  serverError?: MessageKey | null;
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

// The Psychic names the next category. Choosing well is the whole skill of the
// role, so the answers to earlier categories are right here to steer the next
// question. Used by one-phone and online Wavelength alike.
export function CategoryForm({ psychic, board, onAsk, serverError = null }: Props) {
  const { t } = useT();
  const [text, setText] = useState("");

  const asked = board.map((c) => c.name);
  const problem = categoryProblem(asked, text);
  const askedKeys = new Set(asked.map((c) => c.toLocaleLowerCase()));
  const ideas = IDEAS.map((key) => t(key)).filter((label) => !askedKeys.has(label.toLocaleLowerCase()));

  return (
    <main className="screen">
      <div>
        <h1>{t("wl.categoryHeading", { who: psychic })}</h1>
        <p className="status num">
          {t("wl.categoryProgress", { n: board.length + 1, total: CATEGORIES_PER_ROUND })}
        </p>
      </div>

      <form
        id="wl-category"
        onSubmit={(e) => {
          e.preventDefault();
          if (problem === null) onAsk(text.trim());
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
      {problem === null && serverError && <p className="hint">{t(serverError)}</p>}

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

      {board.length > 0 && (
        <section>
          <h2>{t("wl.soFar")}</h2>
          <Board categories={board} />
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
