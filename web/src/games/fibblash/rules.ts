import type { MessageKey } from "../../i18n";

/** Fibblash's rules card in the lobby. The options don't change the rules, only
 * how many questions there are. */
export function fibblashRules(): MessageKey[] {
  return ["fb.rule.kinds", "fb.rule.real", "fb.rule.creative", "fb.rule.hybrid", "fb.rule.screen"];
}
