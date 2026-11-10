import { useState } from "react";
import { useT, type MessageKey } from "../../../i18n";
import type { Choice } from "../gen/fibblash_pb";

interface Props {
  choices: Choice[];
  ownChoiceIds: string[];
  sending: boolean;
  serverError: MessageKey | null;
  onVote: (choiceId: string) => void;
}

// Voting on this phone: tap one, then confirm. Two steps on purpose: a vote
// cannot be changed, and this is played standing up with a drink in hand.
// The player's own answer is on the list, so they can see it went in, but it
// cannot be picked.
export function Ballot({ choices, ownChoiceIds, sending, serverError, onVote }: Props) {
  const { t } = useT();
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <>
      <p className="status">{t("fb.pickOne")}</p>
      <ul className="fb-choices" role="list">
        {choices.map((c) => {
          const mine = ownChoiceIds.includes(c.id);
          return (
            <li key={c.id}>
              <button
                className="fb-choice"
                aria-pressed={picked === c.id}
                disabled={mine || sending}
                onClick={() => setPicked(c.id)}
              >
                <span className="fb-choice-id" aria-hidden="true">
                  {c.id}
                </span>
                <span className="fb-choice-text">{c.text}</span>
                {mine && <span className="pill">{t("fb.yours")}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {serverError && <p className="hint">{t(serverError)}</p>}
      <div className="dock">
        <button className="primary" disabled={picked === null || sending} onClick={() => picked && onVote(picked)}>
          {t("fb.castVote")}
        </button>
      </div>
    </>
  );
}
