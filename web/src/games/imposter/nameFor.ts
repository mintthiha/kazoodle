import type { GameViewProps } from "../registry";

/** Look up a player's display name by id, falling back to the id itself if
 * they've somehow left (a game in progress currently ends when anyone leaves,
 * so this is defensive rather than expected). */
export function nameFor(players: GameViewProps["players"], id: string): string {
  return players.find((p) => p.id === id)?.displayName ?? id;
}
