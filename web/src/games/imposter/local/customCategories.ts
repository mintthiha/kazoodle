// Categories a group writes itself, kept on this phone. Pure functions only: what
// a typed line means, what a valid category is, and how one becomes dealable.

import type { WordEntry } from "./localGame";

/** Below this, the imposter can guess the word just by knowing the list. */
export const MIN_CUSTOM_WORDS = 3;
/** Far more than a sitting can use, and it keeps browser storage small. */
export const MAX_CUSTOM_WORDS = 100;
/** The slip shrinks a word to keep it on one line. At this length that is 18px on
 * a 320px phone, and at 30 it would be 12px, too small to read in a hurry. */
export const MAX_CUSTOM_WORD_LENGTH = 20;
/** A hint wraps on the slip instead of shrinking, so it can be longer than a word.
 * The built-in hints are one related word or two, 16 characters at most. */
export const MAX_CUSTOM_HINT_LENGTH = 30;
export const MAX_CATEGORY_NAME_LENGTH = 24;

const KEY_PREFIX = "custom:";

export interface CustomWord {
  word: string;
  /** Shown only to the imposter, and only when the group has hints switched on. */
  hint: string;
}

export interface CustomCategory {
  /** "custom:<n>". The prefix keeps it apart from the built-in category keys. */
  key: string;
  name: string;
  words: CustomWord[];
}

export function isCustomKey(category: string): boolean {
  return category.startsWith(KEY_PREFIX);
}

/** A key no existing category uses. Not crypto.randomUUID, which browsers only
 * offer on https, and a phone on the dev server's LAN address is on plain http. */
export function nextCustomKey(existing: readonly CustomCategory[]): string {
  const numbers = existing.map((c) => Number(c.key.slice(KEY_PREFIX.length)) || 0);
  return `${KEY_PREFIX}${Math.max(0, ...numbers) + 1}`;
}

/** The words in what someone typed, one "word: hint" per line, tidied, with repeated
 * words dropped. Only the first colon separates, so a hint may contain one. A line
 * still missing its hint or its word is kept, for categoryProblem to report, because
 * dropping it would lose what was typed with no explanation. */
export function parseWords(text: string): CustomWord[] {
  const seen = new Set<string>();
  const words: CustomWord[] = [];
  for (const line of text.split("\n")) {
    const colon = line.indexOf(":");
    const word = (colon < 0 ? line : line.slice(0, colon)).trim();
    const hint = colon < 0 ? "" : line.slice(colon + 1).trim();
    if (!word && !hint) continue;
    const id = word.toLocaleLowerCase();
    if (word && seen.has(id)) continue;
    seen.add(id);
    words.push({ word, hint });
  }
  return words;
}

/** The text parseWords reads back into these words, for reopening a saved category. */
export function formatWords(words: readonly CustomWord[]): string {
  return words.map((w) => `${w.word}: ${w.hint}`).join("\n");
}

export type CategoryProblem =
  | { kind: "nameMissing" }
  | { kind: "nameTaken" }
  | { kind: "wordMissing"; hint: string }
  | { kind: "wordTooLong"; word: string }
  | { kind: "hintTooLong"; word: string }
  | { kind: "hintMissing"; word: string }
  | { kind: "tooFew" }
  | { kind: "tooMany" };

// Spread counts characters, not UTF-16 units, so an emoji counts as one.
const length = (text: string) => [...text].length;

/** The first thing stopping this category being saved, or null if nothing is.
 * `takenNames` holds every other category's name, built-in ones included, because
 * two identical chips in the picker could not be told apart. */
export function categoryProblem(
  name: string,
  words: readonly CustomWord[],
  takenNames: readonly string[],
): CategoryProblem | null {
  const trimmed = name.trim();
  if (!trimmed) return { kind: "nameMissing" };
  const id = trimmed.toLocaleLowerCase();
  if (takenNames.some((taken) => taken.toLocaleLowerCase() === id)) return { kind: "nameTaken" };

  const noWord = words.find((w) => !w.word);
  if (noWord) return { kind: "wordMissing", hint: noWord.hint };
  const longWord = words.find((w) => length(w.word) > MAX_CUSTOM_WORD_LENGTH);
  if (longWord) return { kind: "wordTooLong", word: longWord.word };
  const longHint = words.find((w) => length(w.hint) > MAX_CUSTOM_HINT_LENGTH);
  if (longHint) return { kind: "hintTooLong", word: longHint.word };
  const noHint = words.find((w) => !w.hint);
  if (noHint) return { kind: "hintMissing", word: noHint.word };

  if (words.length < MIN_CUSTOM_WORDS) return { kind: "tooFew" };
  if (words.length > MAX_CUSTOM_WORDS) return { kind: "tooMany" };
  return null;
}

/** The category as dealable words. Nobody typed a translation, so both languages
 * show the words and hints as written. */
export function customEntries(category: CustomCategory): WordEntry[] {
  const name = { en: category.name, fr: category.name };
  return category.words.map(({ word, hint }) => ({
    categoryKey: category.key,
    category: name,
    word: { en: word, fr: word },
    hint: { en: hint, fr: hint },
  }));
}
