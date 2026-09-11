import type { ComponentType } from "react";
import { ImposterGame } from "./imposter";

/** Every game view gets the same props: who this player is, and the roster. */
export interface GameViewProps {
  selfId: string;
  players: { id: string; displayName: string }[];
}

/** game_id -> the component that renders that game for the current player. */
export const gameViews: Record<string, ComponentType<GameViewProps>> = {
  imposter: ImposterGame,
};
