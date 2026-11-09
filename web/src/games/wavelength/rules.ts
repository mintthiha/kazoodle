import type { MessageKey } from "../../i18n";
import type { AnswerMode } from "./local/localGame";
import { decodeStartOptions } from "./messages";

/** Wavelength's rules card, as this group will play them: only the line about
 * answering changes. Shared by the one-phone setup and the online lobby, which
 * play by the same rules. */
export function rulesFor(answers: AnswerMode): MessageKey[] {
  return [
    "wl.rule.roles",
    "wl.rule.scale",
    answers === "spoken" ? "wl.rule.categorySpoken" : "wl.rule.category",
    "wl.rule.three",
    "wl.rule.scoring",
    "wl.rule.rotate",
  ];
}

/** The online lobby's rules card, for options as proto3-JSON. */
export function wavelengthRules(options: string): MessageKey[] {
  return rulesFor(decodeStartOptions(options).answers);
}
