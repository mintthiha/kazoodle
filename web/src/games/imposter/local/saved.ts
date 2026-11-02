// What one-phone mode keeps across a reload, as plain text in browser storage.
//
// A game in progress lives in sessionStorage. The whole game is on this phone, so
// a pull-to-refresh, or the browser discarding a backgrounded tab, would otherwise
// lose the word and the imposter with nothing to recover them from. The names and
// settings live in localStorage, because the same group tends to play again.
//
// Storage can throw (private browsing, blocked site data), and a value can be left
// over from an older build, so every read here tolerates anything and answers with
// "nothing saved".

import {
  DEFAULT_SETTINGS,
  MIN_PLAYERS,
  type LocalGame,
  type LocalSettings,
} from "./localGame";

const GAME_KEY = "pg.imposter.local.game.v1";
const SETUP_KEY = "pg.imposter.local.setup.v1";

export interface LocalSetup {
  /** As typed, so a blank seat stays blank and keeps its "Player 3" placeholder. */
  names: string[];
  settings: LocalSettings;
}

export function defaultSetup(): LocalSetup {
  return { names: Array.from({ length: MIN_PLAYERS }, () => ""), settings: DEFAULT_SETTINGS };
}

/** Reads a saved setup, filling any setting a newer build has added since. */
export function parseSetup(json: string | null): LocalSetup {
  if (!json) return defaultSetup();
  try {
    const value = JSON.parse(json) as Partial<LocalSetup>;
    const names = value.names;
    if (!Array.isArray(names) || names.length < MIN_PLAYERS) return defaultSetup();
    if (!names.every((n) => typeof n === "string")) return defaultSetup();
    return { names, settings: { ...DEFAULT_SETTINGS, ...value.settings } };
  } catch {
    return defaultSetup();
  }
}

/** Reads a saved game. The key's version is what guards the shape, so this only
 * checks that it is plausibly a game rather than validating every field. */
export function parseGame(json: string | null): LocalGame | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<LocalGame>;
    if (!Array.isArray(value.names) || !value.entry || !value.stage) return null;
    return value as LocalGame;
  } catch {
    return null;
  }
}

function read(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

function write(store: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, value);
  } catch {
    // Nothing to do about it. The game plays on, and only a reload would notice.
  }
}

export function loadSetup(): LocalSetup {
  return parseSetup(read(() => localStorage, SETUP_KEY));
}

export function saveSetup(setup: LocalSetup): void {
  write(() => localStorage, SETUP_KEY, JSON.stringify(setup));
}

export function loadGame(): LocalGame | null {
  return parseGame(read(() => sessionStorage, GAME_KEY));
}

export function saveGame(game: LocalGame | null): void {
  write(() => sessionStorage, GAME_KEY, game && JSON.stringify(game));
}
