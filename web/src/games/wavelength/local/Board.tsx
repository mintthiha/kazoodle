import { Avatar } from "../../../players/Avatar";
import { makeSeatHue } from "../../onephone/seatHue";
import { clueGivers, type LocalGame } from "./localGame";

interface Props {
  game: LocalGame;
  /** Mark the newest category as just arrived, so its answers land one by one. */
  freshNewest?: boolean;
}

// Every category asked so far, each with what every Clue Giver answered. This is
// all the Psychic has to go on, so it stays in front of them while they pick the
// next category and while they guess.
//
// Newest first: the category just answered is the one everyone wants to read,
// and on a phone the top of the screen is the only part guaranteed to be seen.
export function Board({ game, freshNewest = false }: Props) {
  const { round, names } = game;
  const givers = clueGivers(game);
  const hue = makeSeatHue(names.length);
  const newest = round.categories.length - 1;
  const order = round.categories.map((_, c) => c).reverse();

  return (
    <ol className="wl-board">
      {order.map((c) => (
        <li key={c} className="wl-cat" data-fresh={freshNewest && c === newest}>
          <h2 className="wl-cat-name">{round.categories[c]}</h2>
          <ul className="wl-answers">
            {givers.map((seat, g) => (
              <li key={seat} className="wl-answer">
                <Avatar name={names[seat]} hue={hue(seat)} />
                <span className="wl-answer-body">
                  <span className="wl-answer-name">{names[seat]}</span>
                  <span className="wl-answer-text">{round.answers[c]?.[g] ?? ""}</span>
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
