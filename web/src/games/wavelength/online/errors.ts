import type { MessageKey } from "../../../i18n";

// The server's refusals of a Wavelength action, as the sentence to show under
// the form that sent it. The codes come from server/internal/games/wavelength/rules.go.
// Most can't happen from this client, which checks the same rules before sending;
// they are here for the ones it can't check, and so nothing ever reads as broken.

const ERRORS: Record<string, MessageKey> = {
  "wavelength.category_repeated": "wl.categoryRepeated",
  "wavelength.category_empty": "wl.errorGeneric",
  "wavelength.category_too_long": "wl.errorGeneric",
  "wavelength.answer_empty": "wl.errorGeneric",
  "wavelength.answer_too_long": "wl.errorGeneric",
  "wavelength.number_out_of_range": "wl.pickNumber",
  game_action_failed: "wl.errorGeneric",
};

/** The warning for a server error code, or null if the code is not about a
 * Wavelength action: a stale "room not found" must not be dressed up as
 * advice about the category just typed. */
export function wlErrorKey(code: string | null): MessageKey | null {
  if (!code) return null;
  return ERRORS[code] ?? null;
}
