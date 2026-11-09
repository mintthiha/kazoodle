import { useState } from "react";
import { useT } from "../../../i18n";
import { Board, type BoardCategory } from "../Board";
import { NumberPad } from "../NumberPad";

interface Props {
  board: BoardCategory[];
  onGuess: (value: number) => void;
}

// The Psychic's one guess, with every answer from the round underneath to read
// while deciding. The pad only selects; the button commits, because the guess
// cannot be taken back.
export function GuessScreen({ board, onGuess }: Props) {
  const { t } = useT();
  const [picked, setPicked] = useState<number | null>(null);
  const [sent, setSent] = useState(false);

  return (
    <main className="screen">
      <div>
        <h1>{t("wl.guessHeadingSelf")}</h1>
        <p className="status local-help">{t("wl.scale")}</p>
      </div>

      <NumberPad label={t("wl.pickNumber")} value={picked} onPick={setPicked} />

      {board.length > 0 && <Board categories={board} />}

      <div className="dock">
        <button
          className="primary"
          disabled={picked === null || sent}
          onClick={() => {
            if (picked === null) return;
            // One guess per round: the button stays down until the result
            // replaces this screen, so a double tap cannot send two.
            setSent(true);
            onGuess(picked);
          }}
        >
          {picked === null ? t("wl.pickNumber") : t("wl.guessButton", { n: picked })}
        </button>
      </div>
    </main>
  );
}
