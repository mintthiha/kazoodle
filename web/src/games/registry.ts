import type { ComponentType } from "react";
import type { MessageKey } from "../i18n";
import { ImposterGame, LocalImposter } from "./imposter";
import { LocalWavelength } from "./wavelength";

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

/** A game that runs entirely on one device gets only a way back out. It has no
 * room, no connection and no roster from the server. */
export interface LocalGameProps {
  onExit: () => void;
}

/** One game as the hub advertises it: how to render it, how to describe it,
 * and the colour of its cover. Adding a game means adding one entry here — the
 * hub list, the URL slug and the view map all read from it. */
export interface GameListing {
  id: string;
  /** The online version, played in a room with a phone each. A game without one
   * is one-phone only: the server has never heard of it, and its tile opens the
   * one-phone version directly. */
  view?: ComponentType<GameViewProps>;
  /** The one-device version, for a game that has one. A listing needs at least
   * one of `view` and `localView`. */
  localView?: ComponentType<LocalGameProps>;
  nameKey: MessageKey;
  /** One line, in the player's words, of what the game actually is. */
  hookKey: MessageKey;
  lengthKey: MessageKey;
  minPlayers: number;
  /** The flat colour behind the tile's cover art, so a shelf of games reads as
   * distinct games rather than one card repeated. */
  cover: string;
}

export const GAMES: GameListing[] = [
  {
    id: "imposter",
    view: ImposterGame,
    localView: LocalImposter,
    nameKey: "game.imposter.name",
    hookKey: "game.imposter.hook",
    lengthKey: "game.imposter.length",
    minPlayers: 3,
    cover: "#ffd60a",
  },
  {
    id: "wavelength",
    localView: LocalWavelength,
    nameKey: "game.wavelength.name",
    hookKey: "game.wavelength.hook",
    lengthKey: "game.wavelength.length",
    minPlayers: 3,
    cover: "#7aa2ff",
  },
];

/** game_id -> the component that renders that game for the current player, for
 * the games that can be played online. */
export const gameViews: Record<string, ComponentType<GameViewProps>> = Object.fromEntries(
  GAMES.flatMap((g) => (g.view ? [[g.id, g.view]] : [])),
);

/** game_id -> the one-device version, for the games that have one. */
export const localGameViews: Record<string, ComponentType<LocalGameProps>> = Object.fromEntries(
  GAMES.flatMap((g) => (g.localView ? [[g.id, g.localView]] : [])),
);

/** The slugs the router accepts as an online session. A one-phone-only game is
 * left out, so a typed /wavelength falls back to the hub instead of opening a
 * room the server could not start a game in. */
export const GAME_IDS: string[] = Object.keys(gameViews);

/** The slugs that also accept /<slug>/local. */
export const LOCAL_GAME_IDS: string[] = Object.keys(localGameViews);
