import type { MessageKey } from "../../i18n";

// The server's refusals of a Fibblash action, as the sentence to show under the
// form that sent it. The codes come from server/internal/games/fibblash/rules.go.
// Most can't happen from this client, which checks the same rules before
// sending; they are here for the ones it can't check (a lie that is secretly
// the truth, a vote that arrives a moment after the clock), and so nothing ever
// reads as broken.

const ERRORS: Record<string, MessageKey> = {
  "fibblash.answer_is_truth": "fb.error.answerIsTruth",
  "fibblash.too_late": "fb.error.tooLate",
  "fibblash.own_choice": "fb.error.ownChoice",
  "fibblash.answer_too_long": "fb.error.tooLong",
  "fibblash.answer_empty": "fb.error.generic",
  "fibblash.already_answered": "fb.error.generic",
  "fibblash.already_voted": "fb.error.generic",
  "fibblash.no_such_choice": "fb.error.generic",
  "fibblash.cannot_vote": "fb.error.generic",
  game_action_failed: "fb.error.generic",
};

/** The warning for a server error code, or null if the code is not about a
 * Fibblash action: a stale "room not found" must not be dressed up as advice
 * about the answer just typed. */
export function fbErrorKey(code: string | null): MessageKey | null {
  if (!code) return null;
  return ERRORS[code] ?? null;
}
