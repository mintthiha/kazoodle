// The rules of one-phone Imposter, as pure functions: state plus an event gives
// new state. No React, no timers, no storage, so every rule here is testable on
// its own. The screens in this folder only render a LocalGame and send events.
//
// This is the one game in the app the server does not run. "The server is
// authoritative" exists so a bad client cannot corrupt a game for the other
// phones in it, and here there are no other phones: everyone is holding the same
// device. It also means the mode works with no server and no signal.

import type { Locale } from "../../../i18n";
import { customEntries, type CustomCategory } from "./customCategories";
import wordList from "./words.gen.json";

/** Same bound as the online game's minimum. */
export const MIN_PLAYERS = 3;
/** A device passed around further than this stops being one table. */
export const MAX_PLAYERS = 12;
/** Mirrors the server's longest display name (room/guest.go's maxNameLen). */
export const MAX_NAME_LENGTH = 24;

/** "manual": someone taps Next player, and Reveal is always available.
 * "auto": a clock moves the turns on, and Reveal waits until they are done. */
export type AdvanceMode = "manual" | "auto";

export interface LocalSettings {
  /** A category key from ../categories, a custom category's key, or "" for any. */
  category: string;
  hintsEnabled: boolean;
  advance: AdvanceMode;
  /** Trips around the table before Reveal. Auto mode only. */
  cluePasses: number;
  /** Seconds per turn. Auto mode only. */
  clueSeconds: number;
}

/** Whole seconds per turn in auto mode. Shorter than the online timer's choices
 * because saying a word out loud is quicker than typing one. */
export const AUTO_SECONDS_OPTIONS = [10, 15, 20, 30] as const;

export const DEFAULT_SETTINGS: LocalSettings = {
  category: "",
  hintsEnabled: false,
  advance: "manual",
  cluePasses: 2,
  clueSeconds: 15,
};

export interface Localized {
  en: string;
  fr: string;
}

export interface WordEntry {
  categoryKey: string;
  category: Localized;
  word: Localized;
  hint: Localized;
}

/** Every word one-phone mode can deal, generated from the server's list. */
export const WORDS: WordEntry[] = wordList;

interface SpeakStage {
  kind: "speak";
  /** 1-based trip around the table. */
  pass: number;
  /** How many players have already spoken on this pass. */
  turn: number;
}

/** Auto mode only: every turn has been taken and the table is talking it over. */
interface DiscussStage {
  kind: "discuss";
}

export type Stage =
  /** Handing the phone round. `seat` is whose word is on screen. */
  | { kind: "deal"; seat: number }
  | SpeakStage
  | DiscussStage
  /** Picking the accused. `from` is where Back returns to. */
  | { kind: "accuse"; from: SpeakStage | DiscussStage }
  | { kind: "verdict"; accused: number };

export interface LocalGame {
  /** Final display names. A player's index in this array is their seat. */
  names: string[];
  settings: LocalSettings;
  imposter: number;
  entry: WordEntry;
  /** The seat that speaks first. Turns then go round the table from there. */
  firstSeat: number;
  stage: Stage;
  /** Words already played this sitting, so Play again deals a new one. */
  usedWords: string[];
}

export type LocalEvent =
  | { type: "dealNext" }
  | { type: "turnDone" }
  | { type: "openAccuse" }
  | { type: "backFromAccuse" }
  | { type: "accuse"; seat: number };

/** The randomness source, so tests can decide the outcome. Returns [0, 1). */
export type Rng = () => number;

function randomInt(n: number, rng: Rng): number {
  return Math.floor(rng() * n);
}

/** Draw a word, avoiding any already played. An unknown category falls back to
 * every word, as the server's pickWord does. Once a category has been played
 * through, its words come round again rather than the game failing to deal.
 *
 * "Any category" draws only from the built-in words: a custom list is whatever one
 * person typed, so nobody should be dealt from it unless the group picked it. */
export function pickWord(
  category: string,
  used: readonly string[],
  rng: Rng,
  custom: readonly CustomCategory[] = [],
): WordEntry {
  const own = custom.find((c) => c.key === category);
  const inCategory = own ? customEntries(own) : WORDS.filter((w) => w.categoryKey === category);
  const pool = inCategory.length > 0 ? inCategory : WORDS;
  const fresh = pool.filter((w) => !used.includes(w.word.en));
  const choices = fresh.length > 0 ? fresh : pool;
  return choices[randomInt(choices.length, rng)];
}

/** The names the game will use: trimmed, with a blank seat falling back to
 * `fallback`, which is given the seat's 1-based number. Nobody has to type a name
 * to play, the same promise the online join screen makes. */
export function resolveNames(raw: readonly string[], fallback: (n: number) => string): string[] {
  return raw.map((name, i) => name.trim() || fallback(i + 1));
}

/** Seats whose name is also used by another seat, ignoring case. Two people
 * called "Sam" cannot be told apart on the ballot, so setup asks for a change. */
export function duplicateSeats(names: readonly string[]): Set<number> {
  const seatsByName = new Map<string, number[]>();
  names.forEach((name, seat) => {
    const key = name.toLocaleLowerCase();
    seatsByName.set(key, [...(seatsByName.get(key) ?? []), seat]);
  });
  const out = new Set<number>();
  for (const seats of seatsByName.values()) {
    if (seats.length > 1) seats.forEach((s) => out.add(s));
  }
  return out;
}

/** Grow or shrink the list of names to `count`, keeping what was already typed.
 * Dropping a seat and adding it back again loses that one name, on purpose: the
 * stepper means "fewer people", not "hide this person". */
export function resizeNames(names: readonly string[], count: number): string[] {
  const bounded = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, count));
  return Array.from({ length: bounded }, (_, i) => names[i] ?? "");
}

/** Deal a new game. `usedWords` carries over between games in one sitting. */
export function newGame(
  names: readonly string[],
  settings: LocalSettings,
  usedWords: readonly string[],
  rng: Rng = Math.random,
  custom: readonly CustomCategory[] = [],
): LocalGame {
  const entry = pickWord(settings.category, usedWords, rng, custom);
  return {
    names: [...names],
    settings,
    imposter: randomInt(names.length, rng),
    entry,
    firstSeat: randomInt(names.length, rng),
    stage: { kind: "deal", seat: 0 },
    usedWords: [...usedWords, entry.word.en],
  };
}

/** Who is speaking on this turn. */
export function speakerSeat(game: LocalGame, turn: number): number {
  return (game.firstSeat + turn) % game.names.length;
}

function advanceTurn(game: LocalGame, stage: SpeakStage): Stage {
  if (stage.turn + 1 < game.names.length) {
    return { ...stage, turn: stage.turn + 1 };
  }
  // The table has gone all the way round. Manual mode just keeps going, since
  // Reveal is always there for whenever the group is ready.
  if (game.settings.advance === "auto" && stage.pass >= game.settings.cluePasses) {
    return { kind: "discuss" };
  }
  return { kind: "speak", pass: stage.pass + 1, turn: 0 };
}

/** True when the current stage offers Reveal: manual mode always during turns,
 * auto mode only once every turn has been taken. */
export function canOpenAccuse(game: LocalGame): boolean {
  if (game.stage.kind === "discuss") return true;
  return game.stage.kind === "speak" && game.settings.advance === "manual";
}

/** The rules. An event that makes no sense for the current stage returns the game
 * unchanged, the way a server would refuse it: the turn clock firing as someone
 * taps Reveal, or a second tap on a button that has already moved on. */
export function step(game: LocalGame, event: LocalEvent): LocalGame {
  const { stage } = game;
  switch (event.type) {
    case "dealNext": {
      if (stage.kind !== "deal") return game;
      if (stage.seat + 1 < game.names.length) {
        return { ...game, stage: { kind: "deal", seat: stage.seat + 1 } };
      }
      return { ...game, stage: { kind: "speak", pass: 1, turn: 0 } };
    }
    case "turnDone":
      if (stage.kind !== "speak") return game;
      return { ...game, stage: advanceTurn(game, stage) };
    case "openAccuse":
      if (!canOpenAccuse(game)) return game;
      if (stage.kind !== "speak" && stage.kind !== "discuss") return game;
      return { ...game, stage: { kind: "accuse", from: stage } };
    case "backFromAccuse":
      if (stage.kind !== "accuse") return game;
      return { ...game, stage: stage.from };
    case "accuse":
      if (stage.kind !== "accuse") return game;
      if (event.seat < 0 || event.seat >= game.names.length) return game;
      return { ...game, stage: { kind: "verdict", accused: event.seat } };
  }
}

/** The good guys win only by naming the actual imposter. */
export function crewWon(game: LocalGame, accused: number): boolean {
  return accused === game.imposter;
}

/** What one player sees on their slip. A locale-free LocalGame means the words
 * follow the language switch even after the deal. The imposter's `word` is empty,
 * and `hint` is empty unless the group turned hints on and this is the imposter,
 * so a screen cannot show either by accident. */
export interface SeatRole {
  isImposter: boolean;
  word: string;
  category: string;
  hint: string;
}

export function roleFor(game: LocalGame, seat: number, locale: Locale): SeatRole {
  const isImposter = seat === game.imposter;
  return {
    isImposter,
    word: isImposter ? "" : game.entry.word[locale],
    category: game.entry.category[locale],
    hint: isImposter && game.settings.hintsEnabled ? game.entry.hint[locale] : "",
  };
}
