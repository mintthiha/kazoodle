import type { GameViewProps } from "../registry";

/** Look up a player's display name by id, falling back to the id itself if
 * they have left. Not merely defensive: a round survives a player leaving
 * (see the server's imposter/leave.go), and their clue stays in the recap
 * after their name is gone from the roster. */
export function nameFor(players: GameViewProps["players"], id: string): string {
  return players.find((p) => p.id === id)?.displayName ?? id;
}
