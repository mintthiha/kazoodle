import { useT } from "../i18n";
import { displayNameOf } from "../displayName";
import type { RoomState } from "../net/connection";

// Who the room is missing right now. Unlike RoomNotice this stays up for as long as
// it is true: a game can be held up by someone whose phone has gone to sleep, and
// the table should be able to see why at any moment, not just the moment it happened.
// It says nothing about waiting, because usually nobody is: the game carries on unless
// it happens to be that player's turn.
export function OfflineNotice({ room }: { room: RoomState }) {
  const { t } = useT();

  const names = room.offline.flatMap((id) => {
    const p = room.players.find((x) => x.id === id);
    return p ? [displayNameOf(p.displayName, t)] : [];
  });
  if (names.length === 0) return null;

  return (
    <div className="room-notice offline-notice" role="status" aria-live="polite">
      <p>{t("room.playerOffline", { who: names.join(", ") })}</p>
    </div>
  );
}
