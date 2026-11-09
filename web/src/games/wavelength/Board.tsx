import { Avatar } from "../../players/Avatar";

/** One Clue Giver's answer, ready to draw. */
export interface BoardAnswer {
  /** Stable React key: a seat number on one phone, a player id online. */
  key: string;
  name: string;
  hue: number;
  text: string;
}

/** One category asked this round and everything said for it. */
export interface BoardCategory {
  name: string;
  answers: BoardAnswer[];
}

interface Props {
  /** Oldest first, the order they were asked in. */
  categories: BoardCategory[];
  /** Mark the newest category as just arrived, so its answers land one by one. */
  freshNewest?: boolean;
}

// Every category asked so far, each with what every Clue Giver answered. This is
// all the Psychic has to go on, so it stays in front of them while they pick the
// next category and while they guess.
//
// Newest first: the category just answered is the one everyone wants to read,
// and on a phone the top of the screen is the only part guaranteed to be seen.
//
// It only draws. One-phone and online Wavelength each turn their own state into
// BoardCategory rows, so neither has to know how the other names its players.
export function Board({ categories, freshNewest = false }: Props) {
  const newest = categories.length - 1;
  const order = categories.map((_, c) => c).reverse();

  return (
    <ol className="wl-board">
      {order.map((c) => (
        <li key={c} className="wl-cat" data-fresh={freshNewest && c === newest}>
          <h2 className="wl-cat-name">{categories[c].name}</h2>
          <ul className="wl-answers">
            {categories[c].answers.map((a) => (
              <li key={a.key} className="wl-answer">
                <Avatar name={a.name} hue={a.hue} />
                <span className="wl-answer-body">
                  <span className="wl-answer-name">{a.name}</span>
                  <span className="wl-answer-text">{a.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
