import type { CSSProperties } from "react";
import { useT } from "../../i18n";
import type { GameListing } from "../../games/registry";
import { GameMark } from "./GameMark";

interface Props {
  game: GameListing;
  /** Position in the list, used only to stagger the entrance. */
  index: number;
  onPick: (id: string) => void;
}

// One game on the shelf. The whole tile is the button — on a phone, held
// one-handed, the target should be the card and not a small label inside it.
export function GameTile({ game, index, onPick }: Props) {
  const { t } = useT();
  const name = t(game.nameKey);

  // The game's two colours ride into CSS as custom properties, so the tile's
  // gradient, mark and glow all come from one place per game.
  const tint = {
    "--tint-a": game.tint[0],
    "--tint-b": game.tint[1],
    animationDelay: `${420 + index * 90}ms`,
  } as CSSProperties;

  return (
    <button className="tile" style={tint} onClick={() => onPick(game.id)}>
      <span className="tile-mark">
        <GameMark gameId={game.id} name={name} />
      </span>

      <span className="tile-text">
        <span className="tile-name">{name}</span>
        <span className="tile-hook">{t(game.hookKey)}</span>
        <span className="tile-meta">
          <span className="chip">{t("home.players", { min: game.minPlayers })}</span>
          <span className="chip">{t(game.lengthKey)}</span>
        </span>
      </span>

      <svg className="tile-go" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.25" />
      </svg>
    </button>
  );
}
