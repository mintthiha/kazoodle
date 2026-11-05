import { useState } from "react";
import { useT } from "../../../i18n";
import { Avatar } from "../../../players/Avatar";
import type { LocalEvent, LocalGame } from "./localGame";
import { makeSeatHue } from "../../onephone/seatHue";

interface Props {
  game: LocalGame;
  dispatch: (event: LocalEvent) => void;
}

// Who the group is accusing. Tapping a name only selects it, and the button below
// commits, because the phone is being held by someone in the middle of an argument
// and the verdict cannot be taken back.
export function AccuseView({ game, dispatch }: Props) {
  const { t } = useT();
  const [picked, setPicked] = useState<number | null>(null);
  const hue = makeSeatHue(game.names.length);

  return (
    <main className="screen">
      <div>
        <h1>{t("local.accuseHeading")}</h1>
        <p className="status">{t("local.accuseBody")}</p>
      </div>

      <ul className="ledger">
        {game.names.map((name, seat) => (
          <li key={seat}>
            <button
              className="ledger-row accuse-row"
              aria-pressed={picked === seat}
              onClick={() => setPicked(seat)}
            >
              <Avatar name={name} hue={hue(seat)} />
              <span className="roster-name">{name}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="dock">
        <button
          className="primary"
          disabled={picked === null}
          onClick={() => picked !== null && dispatch({ type: "accuse", seat: picked })}
        >
          {picked === null ? t("local.accusePick") : t("local.accuseConfirm", { who: game.names[picked] })}
        </button>
        <button className="secondary" onClick={() => dispatch({ type: "backFromAccuse" })}>
          {t("local.back")}
        </button>
      </div>
    </main>
  );
}
