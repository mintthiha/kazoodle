import { useState } from "react";
import { useT } from "../../../i18n";
import { NumberPad } from "../NumberPad";
import { NumberSlip } from "../NumberSlip";
import { clueGivers, type LocalEvent, type LocalGame } from "./localGame";

interface Props {
  game: LocalGame;
  /** Which Clue Giver holds the phone, as an index into clueGivers(). */
  giver: number;
  dispatch: (event: LocalEvent) => void;
}

// One Clue Giver's private moment with the secret. Usually that means turning a
// slip over to read the number. When the Clue Givers chose the number themselves,
// the first of them enters it here instead, and everyone after them reads it back
// off the slip, which is how the group finds out if they all agreed on the same one.
//
// Rendered with a key per Clue Giver, so every person gets a fresh screen: the slip
// face down, and the button that passes the phone on locked until they have looked.
export function SecretView({ game, giver, dispatch }: Props) {
  const { t } = useT();
  const [seen, setSeen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);

  const { names, round } = game;
  const givers = clueGivers(game);
  const seat = givers[giver];
  const last = giver + 1 >= givers.length;
  const nextSeat = last ? round.psychic : givers[giver + 1];
  const lastToTable = last && game.settings.answers === "spoken";

  return (
    <main className="screen">
      <div>
        <h1>{t("local.passTo", { who: names[seat] })}</h1>
        <p className="status num">{t("wl.giverProgress", { n: giver + 1, total: givers.length })}</p>
      </div>

      {round.secret === null ? (
        <>
          <div>
            <h2>{t("wl.enterHeading")}</h2>
            <p className="status">{t("wl.scale")}</p>
          </div>
          <NumberPad label={t("wl.pickNumber")} value={picked} onPick={setPicked} />
        </>
      ) : (
        <NumberSlip secret={round.secret} onReveal={() => setSeen(true)} />
      )}

      <div className="dock">
        {round.secret === null ? (
          <button
            className="primary"
            disabled={picked === null}
            onClick={() => picked !== null && dispatch({ type: "chooseSecret", value: picked })}
          >
            {picked === null ? t("wl.pickNumber") : t("wl.lockNumber", { n: picked })}
          </button>
        ) : (
          <button className="primary" disabled={!seen} onClick={() => dispatch({ type: "secretSeen" })}>
            {/* With spoken answers the last Clue Giver puts the phone down for the
                table instead of handing it to the Psychic. */}
            {lastToTable ? t("wl.startTalking") : t("wl.passOn", { who: names[nextSeat] })}
          </button>
        )}
      </div>
    </main>
  );
}
