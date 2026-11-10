import { useState } from "react";
import { useT } from "../../../i18n";
import { joinNames } from "../../../players/joinNames";
import { clueGivers, type LocalGame } from "./localGame";

interface Props {
  game: LocalGame;
  onReady: () => void;
}

// A spoken round: the phone lies on the table while everyone talks, so this screen
// is a reminder of the steps and the way on to the guess, and nothing more.
//
// A Clue Giver halfway through the second category can forget the number, so
// there's a way to check it. It starts face down, and it only shows while someone
// holds it open, for the same reason as the slip.
export function TalkView({ game, onReady }: Props) {
  const { locale, t } = useT();
  const [peeking, setPeeking] = useState(false);
  const { names, round } = game;
  const psychic = names[round.psychic];
  const givers = joinNames(
    clueGivers(game).map((seat) => names[seat]),
    locale,
  );

  return (
    <main className="screen">
      <h1 className="wl-headline">{t("wl.talkHeading")}</h1>

      <ol className="wl-talk">
        <li>{t("wl.talkCategory", { who: psychic })}</li>
        <li>{t("wl.talkAnswers", { who: givers })}</li>
        <li>{t("wl.talkRepeat", { who: psychic })}</li>
      </ol>

      <button className="wl-peek" aria-pressed={peeking} onClick={() => setPeeking(!peeking)}>
        {peeking ? (
          <>
            <span className="wl-peek-number num">
              <mark>{round.secret}</mark>
            </span>
            <span className="wl-peek-action">{t("imposter.peekHide")}</span>
          </>
        ) : (
          <>
            <span>{t("wl.peekShow")}</span>
            <span className="wl-peek-note">{t("wl.peekNote", { who: psychic })}</span>
          </>
        )}
      </button>

      <div className="dock">
        <button className="primary" onClick={onReady}>
          {t("wl.readyToGuess", { who: psychic })}
        </button>
      </div>
    </main>
  );
}
