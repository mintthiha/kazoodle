import { useT } from "../../../i18n";
import { Avatar } from "../../../players/Avatar";
import { TwoTapButton } from "../../../screens/TwoTapButton";
import type { People } from "./people";

interface Props {
  /** Players still in the room, who can be removed. */
  playerIds: string[];
  offline: string[];
  people: People;
  /** False on the final standings, where only "back to the lobby" is left. */
  canAdvance: boolean;
  onNext: () => void;
  onSkip: () => void;
  onEnd: () => void;
  onRemove: (playerId: string) => void;
  /** Controlled open state, for a parent that re-mounts this between phases
   * and wants the panel to stay as the host left it. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
}

// The host's overrides. Everything runs on its own clock by default; these are
// for when a phone is face down in someone's pocket, a question falls flat, or
// the pizza arrives. Folded away in a <details> so it never crowds the game.
export function HostControls({
  playerIds,
  offline,
  people,
  canAdvance,
  onNext,
  onSkip,
  onEnd,
  onRemove,
  open,
  onToggle,
}: Props) {
  const { t } = useT();
  return (
    <details className="fb-host" open={open} onToggle={(e) => onToggle?.(e.currentTarget.open)}>
      <summary>{t("fb.host.title")}</summary>
      <div className="fb-host-body">
        {canAdvance && (
          <div className="fb-host-actions">
            <button className="secondary" onClick={onNext}>
              {t("fb.host.next")}
            </button>
            <button className="secondary" onClick={onSkip}>
              {t("fb.host.skip")}
            </button>
            <TwoTapButton label={t("fb.host.end")} confirmLabel={t("fb.host.endConfirm")} onConfirm={onEnd} />
          </div>
        )}
        <h2>{t("fb.host.players")}</h2>
        <ul className="roster" role="list">
          {playerIds.map((id) => (
            <li key={id} className="roster-row">
              <Avatar name={people.nameFor(id)} hue={people.hueFor(id)} />
              <span className="roster-name">{people.nameFor(id)}</span>
              {offline.includes(id) && <span className="pill pill-offline">{t("lobby.offline")}</span>}
              {id !== people.selfId && (
                <TwoTapButton
                  label={t("lobby.remove")}
                  confirmLabel={t("lobby.removeConfirm")}
                  onConfirm={() => onRemove(id)}
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
