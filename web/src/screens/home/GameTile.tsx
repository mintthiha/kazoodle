import type { CSSProperties } from "react";
import { useT } from "../../i18n";
import type { GameListing } from "../../games/registry";
import { GameCover } from "./GameCover";

interface Props {
  game: GameListing;
  onPick: (id: string) => void;
}

// One game on the shelf. The whole tile is the button — on a phone, held
// one-handed, the target should be the card and not a small label inside it.
// The "Play" shape inside is only there to say so at a glance.
export function GameTile({ game, onPick }: Props) {
  const { t } = useT();
  const name = t(game.nameKey);

  return (
    <button
      className="tile"
      style={{ "--cover": game.cover } as CSSProperties}
      onClick={() => onPick(game.id)}
    >
      <GameCover gameId={game.id} name={name} />

      <span className="tile-body">
        <span className="tile-name">{name}</span>
        <span className="tile-hook">{t(game.hookKey)}</span>
        <span className="tile-foot">
          <span className="tile-meta">
            {t("home.players", { min: game.minPlayers })} · {t(game.lengthKey)}
          </span>
          <span className="tile-play">{t("home.play")}</span>
        </span>
      </span>
    </button>
  );
}
