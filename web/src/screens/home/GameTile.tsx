import type { CSSProperties } from "react";
import { useT } from "../../i18n";
import type { GameListing } from "../../games/registry";
import { GameCover } from "./GameCover";

interface Props {
  game: GameListing;
  onPick: (id: string) => void;
  onPickLocal: (id: string) => void;
}

// One game on the shelf. The whole tile is the button — on a phone, held
// one-handed, the target should be the card and not a small label inside it.
// The "Play" shape inside is only there to say so at a glance.
//
// The one-phone way in sits on the shelf rather than behind the tile, because
// tapping the tile opens a connection, and this mode has to be reachable with no
// server and no signal. It is a sibling of the tile, not inside it: one button
// cannot legally contain another.
//
// A game with no online version has nothing to connect to, so the tile itself
// opens the one-phone version and there is no second button.
export function GameTile({ game, onPick, onPickLocal }: Props) {
  const { t } = useT();
  const name = t(game.nameKey);
  const localOnly = !game.online;

  return (
    <div className="tile-card">
      <button
        className="tile"
        style={{ "--cover": game.cover } as CSSProperties}
        onClick={() => (localOnly ? onPickLocal(game.id) : onPick(game.id))}
      >
        <GameCover gameId={game.id} name={name} />

        <span className="tile-body">
          <span className="tile-name">{name}</span>
          <span className="tile-hook">{t(game.hookKey)}</span>
          <span className="tile-foot">
            <span className="tile-meta">
              {t("home.players", { min: game.minPlayers })} · {t(game.lengthKey)}
              {localOnly && ` · ${t("home.onePhone")}`}
            </span>
            <span className="tile-play">{t("home.play")}</span>
          </span>
        </span>
      </button>
      {game.localView && !localOnly && (
        <button className="secondary tile-local" onClick={() => onPickLocal(game.id)}>
          {t("local.entry")}
        </button>
      )}
    </div>
  );
}
