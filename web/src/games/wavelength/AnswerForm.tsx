import { useState } from "react";
import { useT, type MessageKey } from "../../i18n";
import { MAX_ANSWER_LENGTH, answerProblem } from "./local/localGame";

interface Props {
  /** Whose answer this is, shown above the category. */
  name: string;
  category: string;
  secret: number;
  onLock: (text: string) => void;
  /** A refusal from the server, online only. */
  serverError?: MessageKey | null;
}

// One Clue Giver answers the open category, in private, with their number in
// front of them. Used by one-phone Wavelength after the handover, and online
// on each Clue Giver's own phone.
export function AnswerForm({ name, category, secret, onLock, serverError = null }: Props) {
  const { t } = useT();
  const [text, setText] = useState("");
  const problem = answerProblem(text);

  return (
    <main className="screen">
      <div>
        <p className="status">{name}</p>
        <h1 className="wl-headline">{category}</h1>
      </div>

      <div className="wl-mine">
        <span className="wl-mine-label">{t("wl.yourNumber")}</span>
        <span className="wl-mine-number num">
          <mark>{secret}</mark>
        </span>
      </div>
      <div>
        <p className="wl-lead">{t("wl.answerPrompt", { n: secret })}</p>
        <p className="status local-help">{t("wl.scale")}</p>
      </div>

      <form
        id="wl-answer"
        onSubmit={(e) => {
          e.preventDefault();
          if (problem === null) onLock(text.trim());
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
      {problem === null && serverError && <p className="hint">{t(serverError)}</p>}

      <div className="dock">
        <button type="submit" form="wl-answer" className="primary" disabled={problem !== null}>
          {t("wl.lockAnswer")}
        </button>
      </div>
    </main>
  );
}
