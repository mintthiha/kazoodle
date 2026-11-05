import { useState } from "react";
import { useT } from "../../../i18n";
import {
  MAX_CATEGORY_NAME_LENGTH,
  MAX_CUSTOM_HINT_LENGTH,
  MAX_CUSTOM_WORDS,
  MAX_CUSTOM_WORD_LENGTH,
  MIN_CUSTOM_WORDS,
  categoryProblem,
  formatWords,
  parseWords,
  type CategoryProblem,
  type CustomCategory,
  type CustomWord,
} from "./customCategories";
import { TwoTapButton } from "../../onephone/TwoTapButton";

const UNFINISHED: CategoryProblem["kind"][] = ["nameMissing", "hintMissing", "tooFew"];

interface Props {
  /** The category being changed, or null when writing a new one. */
  category: CustomCategory | null;
  /** Every other category's name, as the picker shows it. */
  takenNames: string[];
  onSave: (name: string, words: CustomWord[]) => void;
  onDelete: () => void;
  onBack: () => void;
}

// Writing a category. The words stay as typed while editing, and only become a list
// on save, so a half-typed line is not tidied away under someone's thumb.
export function CategoryEditor({ category, takenNames, onSave, onDelete, onBack }: Props) {
  const { t } = useT();
  const [name, setName] = useState(category?.name ?? "");
  const [text, setText] = useState(category ? formatWords(category.words) : "");

  const words = parseWords(text);
  const problem = categoryProblem(name, words, takenNames);

  function problemText(p: CategoryProblem): string {
    switch (p.kind) {
      case "nameMissing":
        return t("local.customNameMissing");
      case "nameTaken":
        return t("local.customNameTaken");
      case "wordMissing":
        return t("local.customWordMissing", { hint: p.hint });
      case "wordTooLong":
        return t("local.customWordTooLong", { word: p.word, n: MAX_CUSTOM_WORD_LENGTH });
      case "hintTooLong":
        return t("local.customHintTooLong", { word: p.word, n: MAX_CUSTOM_HINT_LENGTH });
      case "hintMissing":
        return t("local.customHintMissing", { word: p.word });
      case "tooFew":
        return t("local.customTooFew", { n: MIN_CUSTOM_WORDS });
      case "tooMany":
        return t("local.customTooMany", { n: MAX_CUSTOM_WORDS });
    }
  }

  return (
    <main className="screen">
      <h1>{category ? t("local.customEdit") : t("local.customNew")}</h1>

      <label className="category-field">
        <span>{t("local.customName")}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("local.customNamePlaceholder")}
          autoComplete="off"
          autoCapitalize="sentences"
          maxLength={MAX_CATEGORY_NAME_LENGTH}
        />
      </label>

      <label className="category-field">
        <span>{t("local.customWords")}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("local.customWordsPlaceholder")}
          rows={8}
          autoComplete="off"
          autoCapitalize="sentences"
        />
      </label>
      <p className="status local-help">
        {t("local.customWordsHelp")} <span className="num">{t("local.customWordCount", { n: words.length })}</span>
      </p>

      <div className="category-actions">
        <button className="secondary" onClick={onBack}>
          {t("local.back")}
        </button>
        {category && (
          <TwoTapButton
            label={t("local.customDelete")}
            confirmLabel={t("local.customDeleteConfirm")}
            onConfirm={onDelete}
          />
        )}
      </div>

      {/* Only Save stays docked: this screen is used with the keyboard up, and every
          docked line takes room from the box being typed in. */}
      <div className="dock">
        {problem && (
          // Not finished yet is not a mistake, so only real clashes are in red. A
          // word waiting for its hint is what every line looks like mid-typing.
          <p className={UNFINISHED.includes(problem.kind) ? "status" : "hint"}>{problemText(problem)}</p>
        )}
        <button className="primary" disabled={problem !== null} onClick={() => onSave(name.trim(), words)}>
          {t("local.customSave")}
        </button>
      </div>
    </main>
  );
}
