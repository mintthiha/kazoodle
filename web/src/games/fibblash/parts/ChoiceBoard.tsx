import type { Choice } from "../gen/fibblash_pb";

interface Props {
  choices: Choice[];
  /** The choice this phone voted for, marked once the vote is locked. */
  picked?: string | null;
  ownChoiceIds?: string[];
}

// The ballot as something to read rather than tap: on the main screen while
// everyone votes, and on a phone once its vote is in.
export function ChoiceBoard({ choices, picked = null, ownChoiceIds = [] }: Props) {
  return (
    <ul className="fb-board" role="list">
      {choices.map((c) => (
        <li
          key={c.id}
          className="fb-board-item"
          data-picked={picked === c.id}
          data-own={ownChoiceIds.includes(c.id)}
        >
          <span className="fb-choice-id" aria-hidden="true">
            {c.id}
          </span>
          <span className="fb-choice-text">{c.text}</span>
        </li>
      ))}
    </ul>
  );
}
