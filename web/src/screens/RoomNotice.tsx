import { useEffect, useState } from "react";
import { useT } from "../i18n";
import type { GameEnd, Player } from "../net/connection";
import { endReasonKey } from "./endReason";

interface Props {
  departure: Player | null;
  gameEnd: GameEnd | null;
}

// How long a notice stays up. Long enough to read standing up, mid-game,
// without becoming a permanent fixture of the screen.
const SHOW_MS = 6000;

/** Show `value` until SHOW_MS has passed since it last changed, then nothing.
 *
 * The connection snapshot holds the most recent departure and game end
 * indefinitely — it has no concept of "stale" — so transience lives here
 * instead. Each distinct value gets its own timer, and because the snapshot
 * makes a fresh object per event, two departures in a row re-show the notice
 * rather than letting the first one's timer end the second early. */
function useTransient<T>(value: T | null): T | null {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    setShown(value);
    if (value === null) return;
    const id = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(id);
  }, [value]);

  return shown;
}

// A transient strip for things that happen *to* the room rather than in it: a
// player leaving, and a round being abandoned. Both used to be silent — the
// roster simply shrank, and an abandoned round dropped everyone back to the
// lobby with no explanation at all.
export function RoomNotice({ departure, gameEnd }: Props) {
  const { t } = useT();
  const shownDeparture = useTransient(departure);
  const shownEnd = useTransient(gameEnd);

  const endKey = shownEnd ? endReasonKey(shownEnd.reason) : null;

  if (!shownDeparture && !endKey) return null;

  return (
    <div className="room-notice" role="status" aria-live="polite">
      {shownDeparture && <p>{t("room.playerLeft", { who: shownDeparture.displayName })}</p>}
      {endKey && <p>{t(endKey)}</p>}
    </div>
  );
}
