import { useState } from "react";
import { useT, type MessageKey } from "../../../i18n";
import { Kind } from "../gen/fibblash_pb";

interface Props {
  kind: Kind;
  maxLength: number;
  /** True from sending until the server confirms or refuses. */
  sending: boolean;
  serverError: MessageKey | null;
  onSubmit: (text: string) => void;
  /** Called as the player edits, so an old refusal does not outlive the mistake. */
  onEdit: () => void;
}

// One answer, typed on this phone. It stays mounted while the answer is in
// flight, so a refusal ("that's the real answer!") comes back to the words the
// player typed rather than to an empty box.
export function AnswerForm({ kind, maxLength, sending, serverError, onSubmit, onEdit }: Props) {
  const { t } = useT();
  const [text, setText] = useState("");
  // Counted in characters the way the server counts them (runes), so an
  // accented letter or an emoji is one, not two.
  const length = [...text.trim()].length;
  const tooLong = length > maxLength;
  const canSend = length > 0 && !tooLong && !sending;

  return (
    <>
      <form
        id="fb-answer"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSubmit(text.trim());
        }}
      >
        <label className="field">
          <span>{kind === Kind.CREATIVE ? t("fb.answerLabelJoke") : t("fb.answerLabelLie")}</span>
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onEdit();
            }}
            maxLength={maxLength + 10}
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
            autoFocus
          />
        </label>
        <p className="fb-counter num" data-over={tooLong} aria-live="polite">
          {length}/{maxLength}
        </p>
      </form>
      {tooLong && <p className="hint">{t("fb.answerTooLong", { n: maxLength })}</p>}
      {!tooLong && serverError && <p className="hint">{t(serverError)}</p>}
      <div className="dock">
        <button type="submit" form="fb-answer" className="primary" disabled={!canSend}>
          {t("fb.lockAnswer")}
        </button>
      </div>
    </>
  );
}
