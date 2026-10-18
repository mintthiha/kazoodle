// The shape of a match: how many rounds it runs for, and how many times the
// table goes around giving clues inside each round. Both mirror the server's
// own bounds (server/internal/games/imposter/score.go) — the server corrects
// anything out of range rather than failing the start, so a drift here
// degrades to a sane match instead of a broken one.
import type { MessageKey } from "../../i18n/messages";

export const DEFAULT_ROUNDS = 3;

/** The match lengths the host can pick between. Every player is the imposter
 * roughly once per group-size rounds, so these are "a quick one", "everyone
 * gets a turn", and "a proper session". */
export const ROUND_OPTIONS = [3, 5, 7] as const;

export const DEFAULT_CLUE_PASSES = 2;

/** How many clues each player gives before the vote. Two is the default: one
 * clue each is over before the imposter has heard enough to contradict
 * themselves, which is where the game actually happens. Labelled by what a
 * player experiences ("two clues each") rather than by the mechanism. */
export interface CluePassOption {
  passes: number;
  labelKey: MessageKey;
}

export const CLUE_PASS_OPTIONS: CluePassOption[] = [
  { passes: 1, labelKey: "lobby.cluePassesOne" },
  { passes: 2, labelKey: "lobby.cluePassesTwo" },
  { passes: 3, labelKey: "lobby.cluePassesThree" },
];
