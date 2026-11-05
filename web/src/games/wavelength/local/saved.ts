// What one-phone Wavelength keeps across a reload, as plain text in browser storage.
//
// A game in progress lives in sessionStorage. Everything is on this phone, so a
// pull-to-refresh, or the browser discarding a backgrounded tab, would otherwise
// lose the secret number and every answer typed so far. The names and settings
// live in localStorage, because the same group tends to play again.
//
// A value can be left over from an older build, so every read here tolerates
// anything and answers with "nothing saved".

import { readStored, writeStored } from "../../onephone/storage";
import { DEFAULT_SETTINGS, MAX_PLAYERS, MIN_PLAYERS, type LocalGame, type LocalSettings } from "./localGame";

const GAME_KEY = "pg.wavelength.local.game.v1";
const SETUP_KEY = "pg.wavelength.local.setup.v1";

export interface LocalSetup {
  /** As typed, so a blank seat stays blank and keeps its "Player 3" placeholder. */
  names: string[];
  settings: LocalSettings;
}

export function defaultSetup(): LocalSetup {
  return { names: Array.from({ length: MIN_PLAYERS }, () => ""), settings: DEFAULT_SETTINGS };
}

function parseSettings(value: unknown): LocalSettings {
  const s = value as Partial<LocalSettings> | null;
  return { secret: s?.secret === "chosen" ? "chosen" : DEFAULT_SETTINGS.secret };
}

/** Reads a saved setup, falling back to the defaults for anything that does not
 * look right, one field at a time. */
export function parseSetup(json: string | null): LocalSetup {
  if (!json) return defaultSetup();
  try {
    const value = JSON.parse(json) as Partial<LocalSetup> | null;
    const names = value?.names;
    const namesOk =
      Array.isArray(names) &&
      names.length >= MIN_PLAYERS &&
      names.length <= MAX_PLAYERS &&
      names.every((n) => typeof n === "string");
    return {
      names: namesOk ? names : defaultSetup().names,
      settings: parseSettings(value?.settings),
    };
  } catch {
    return defaultSetup();
  }
}

/** Reads a saved game. The key's version is what guards the shape, so this only
 * checks that it is plausibly a game rather than validating every field. */
export function parseGame(json: string | null): LocalGame | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<LocalGame> | null;
    if (!Array.isArray(value?.names) || !Array.isArray(value.scores) || !value.round || !value.stage) {
      return null;
    }
    return value as LocalGame;
  } catch {
    return null;
  }
}

export function loadSetup(): LocalSetup {
  return parseSetup(readStored(() => localStorage, SETUP_KEY));
}

export function saveSetup(setup: LocalSetup): void {
  writeStored(() => localStorage, SETUP_KEY, JSON.stringify(setup));
}

export function loadGame(): LocalGame | null {
  return parseGame(readStored(() => sessionStorage, GAME_KEY));
}

export function saveGame(game: LocalGame | null): void {
  writeStored(() => sessionStorage, GAME_KEY, game && JSON.stringify(game));
}
