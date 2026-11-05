import type { MessageKey } from "../../i18n";

/** Online Imposter's rules, for the lobby's rules card. One-phone mode has its own
 * list in local/SetupView, because it plays by spoken clues and keeps no score. */
export const IMPOSTER_RULES: MessageKey[] = [
  "imposter.rule.word",
  "imposter.rule.clues",
  "imposter.rule.vote",
  "imposter.rule.steal",
  "imposter.rule.scoring",
  "imposter.rule.fairPlay",
  "imposter.rule.two",
];
