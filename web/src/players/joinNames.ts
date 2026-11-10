import type { Locale } from "../i18n";

/** "Ben and Cleo", "Ben, Cleo et Dee": a list of names the way each language
 * writes one, so a sentence like "+1 each for {who}" reads naturally. */
export function joinNames(names: readonly string[], locale: Locale): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(names);
}
