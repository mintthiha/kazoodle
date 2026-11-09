import { useState } from "react";
import { useT } from "../../../i18n";
import { Board } from "./Board";
import { NumberPad } from "./NumberPad";
import type { LocalEvent, LocalGame } from "./localGame";

interface Props {
  game: LocalGame;
  dispatch: (event: LocalEvent) => void;
}

// The Psychic's one guess, with every answer from the round underneath to read
// while deciding. The pad only selects; the button commits, because the guess
// cannot be taken back.
export function GuessView({ game, dispatch }: Props) {
  const { t } = useT();
  const [picked, setPicked] = useState<number | null>(null);
  const psychic = game.names[game.round.psychic];

  return (
    <main className="screen">
      <div>
        <h1>{t("wl.guessHeading", { who: psychic })}</h1>
        <p className="status local-help">{t("wl.scale")}</p>
      </div>

      <NumberPad label={t("wl.pickNumber")} value={picked} onPick={setPicked} />

      {/* Spoken rounds have nothing written down to show. */}
      {game.round.categories.length > 0 && <Board game={game} />}

      <div className="dock">
        <button
          className="primary"
          disabled={picked === null}
          onClick={() => picked !== null && dispatch({ type: "guess", value: picked })}
        >
          {picked === null ? t("wl.pickNumber") : t("wl.guessButton", { n: picked })}
        </button>
      </div>
    </main>
  );
}
