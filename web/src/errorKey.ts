import type { MessageKey } from "./i18n";

// Every error code the server can send, mapped to the sentence the player
// reads. The server sends a code and an English message; only the code is
// used, because the server does not know which language this player reads.
//
// Codes live in server/internal/ws/conn.go. A code with no entry here falls
// back to the generic line — wrong-but-honest beats a raw code on screen.
const ERRORS: Record<string, MessageKey> = {
  room_not_found: "error.room_not_found",
  not_host: "error.not_host",
  game_in_progress: "error.game_in_progress",
  unknown_game: "error.unknown_game",
  start_failed: "error.start_failed",
  already_in_room: "error.already_in_room",
  not_in_room: "error.not_in_room",
};

/** The message key for a server error code, or null when there is no error.
 *
 * Unknown codes resolve to the generic line rather than null: an error the
 * player cannot be told about is how a button comes to look broken, which is
 * a bug this app has already shipped once. */
export function errorKey(code: string | null): MessageKey | null {
  if (!code) return null;
  return ERRORS[code] ?? "error.generic";
}
