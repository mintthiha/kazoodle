import type { MessageKey } from "../../i18n";

// What the player reads when one of their typed inputs is refused, for each
// of the two screens that take one.
//
// Two sources feed these. A local rule is one this side can judge on its own
// — an empty box — and it is answered instantly, without a round trip. Every
// other rule belongs to the server, which is the only side that knows the
// secret word and what has already been said; it sends back a stable code,
// never a sentence, because it has no idea which language this player is
// reading in. The codes come from server/internal/games/imposter/clue.go.

const CLUE_ERRORS: Record<string, MessageKey> = {
  "imposter.clue_empty": "imposter.clueErrorEmpty",
  "imposter.clue_is_the_word": "imposter.clueErrorIsTheWord",
  "imposter.clue_duplicate": "imposter.clueErrorDuplicate",
  // A refusal with no specific reason. Submitting a clue is the only action
  // that screen sends, so a generic failure there is still about the clue.
  game_action_failed: "imposter.clueErrorGeneric",
};

const GUESS_ERRORS: Record<string, MessageKey> = {
  // The steal screen sends exactly one kind of action too, and the server has
  // no coded rejections for a guess beyond the generic one: it cannot tell
  // the imposter why a guess is wrong without telling them the word.
  game_action_failed: "imposter.guessErrorGeneric",
};

/** The warning to raise for a clue before sending it, or null if the clue is
 * worth sending. */
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

/** The warning to raise for a steal guess before sending it, or null if the
 * guess is worth sending. A wrong guess is not a warning — it is how the
 * round ends. */
export function localGuessWarning(text: string): MessageKey | null {
  return text.trim() ? null : "imposter.guessErrorEmpty";
}

/** The warning to show above the steal input for a server error code, or null
 * if that code is not about the guess. */
export function guessErrorKey(code: string | null): MessageKey | null {
  if (!code) return null;
  return GUESS_ERRORS[code] ?? null;
}
