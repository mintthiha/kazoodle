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

/** One entry in a numeric lobby picker: the value sent to the server, and the
 * label the host reads. Labelled by what a player experiences ("two clues
 * each") rather than by the mechanism. */
export interface NumberChoice {
  value: number;
  labelKey: MessageKey;
}

/** No clock, which is the default and how the game worked before the clock
 * existed. Mirrors the server reading clue_seconds 0 as "off" — note that is
 * the opposite of how rounds and clue passes read their zero, where 0 means
 * "use the default". */
export const DEFAULT_CLUE_SECONDS = 0;

/** How long each player gets for one clue. Off first, because a timer should
 * be something a room chooses rather than something it discovers. 20 seconds
 * is enough to think of a word and not enough to agonise. */
export const CLUE_SECONDS_OPTIONS: NumberChoice[] = [
  { value: 0, labelKey: "lobby.clueSecondsOff" },
  { value: 15, labelKey: "lobby.clueSeconds15" },
  { value: 20, labelKey: "lobby.clueSeconds20" },
  { value: 30, labelKey: "lobby.clueSeconds30" },
];

/** How many clues each player gives before the vote. */
export const CLUE_PASS_OPTIONS: NumberChoice[] = [
  { value: 1, labelKey: "lobby.cluePassesOne" },
  { value: 2, labelKey: "lobby.cluePassesTwo" },
  { value: 3, labelKey: "lobby.cluePassesThree" },
];
