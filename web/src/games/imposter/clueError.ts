import type { MessageKey } from "../../i18n";

// Rejection codes the server can send back when it refuses a clue, mapped to
// the sentence the player reads. The codes are defined once, in
// server/internal/games/imposter/clue.go — the server sends the code, never
// the sentence, because it has no idea which language this player is reading
// in.
const CLUE_ERRORS: Record<string, MessageKey> = {
  "imposter.clue_empty": "imposter.clueErrorEmpty",
  "imposter.clue_is_the_word": "imposter.clueErrorIsTheWord",
  "imposter.clue_duplicate": "imposter.clueErrorDuplicate",
  // A refusal with no specific reason. Submitting a clue is the only action
  // this screen sends, so a generic failure here is still about the clue.
  game_action_failed: "imposter.clueErrorGeneric",
};

/** The warning to raise for a clue before sending it, or null if the clue is
 * worth sending. Only the rules that need no knowledge of the round live here
 * — the server owns the real ones, since it is the only side that knows the
 * secret word and what has already been said. */
export function localClueWarning(text: string): MessageKey | null {
  return text.trim() ? null : "imposter.clueErrorEmpty";
}

/** The warning to show above the clue input for a server error code, or null
 * if that code is not about the clue — a stale "room not found" must not be
 * dressed up as advice about what the player just typed. */
export function clueErrorKey(code: string | null): MessageKey | null {
  if (!code) return null;
  return CLUE_ERRORS[code] ?? null;
}
