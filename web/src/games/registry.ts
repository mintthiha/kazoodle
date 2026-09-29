import type { ComponentType } from "react";
import { ImposterGame } from "./imposter";

/** Every game view gets the same props: who this player is, the roster, and
 * whether this player is the room's host (the one who can start a new round). */
export interface GameViewProps {
  selfId: string;
  players: { id: string; displayName: string }[];
  isHost: boolean;
}

/** game_id -> the component that renders that game for the current player. */
export const gameViews: Record<string, ComponentType<GameViewProps>> = {
  imposter: ImposterGame,
};
