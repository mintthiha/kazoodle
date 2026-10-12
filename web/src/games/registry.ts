import type { ComponentType } from "react";
import type { MessageKey } from "../i18n";
import { ImposterGame } from "./imposter";

/** Every game view gets the same props: who this player is, the roster, and
 * whether this player is the room's host (the one who can start a new round).
 *
 * `departed` is the other half of the roster: players who have left. A round
 * can outlive a departure, so a game still has to be able to name an id that
 * is no longer in `players` — see imposter/nameFor.ts. */
export interface GameViewProps {
  selfId: string;
  players: { id: string; displayName: string }[];
  departed: { id: string; displayName: string }[];
  isHost: boolean;
}

/** One game as the hub advertises it: how to render it, how to describe it,
 * and the two colours its tile is drawn in. Adding a game means adding one
 * entry here — the hub list, the URL slug and the view map all read from it. */
export interface GameListing {
  id: string;
  view: ComponentType<GameViewProps>;
  nameKey: MessageKey;
  /** One line, in the player's words, of what the game actually is. */
  hookKey: MessageKey;
  lengthKey: MessageKey;
  minPlayers: number;
  /** Gradient stops for the tile's mark and wash, so a shelf of games reads as
   * distinct games rather than one card repeated. */
  tint: [string, string];
}

export const GAMES: GameListing[] = [
  {
    id: "imposter",
    view: ImposterGame,
    nameKey: "game.imposter.name",
    hookKey: "game.imposter.hook",
    lengthKey: "game.imposter.length",
    minPlayers: 3,
    tint: ["#5a4bff", "#ff3d7f"],
  },
];

/** game_id -> the component that renders that game for the current player. */
export const gameViews: Record<string, ComponentType<GameViewProps>> = Object.fromEntries(
  GAMES.map((g) => [g.id, g.view]),
);

/** The slugs the router accepts. */
export const GAME_IDS: string[] = GAMES.map((g) => g.id);
