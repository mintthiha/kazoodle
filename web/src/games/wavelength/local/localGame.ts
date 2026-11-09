// The rules of one-phone Wavelength, as pure functions: state plus an event gives
// new state. No React, no storage, and randomness only through a passed-in Rng, so
// every rule here is testable on its own. The screens in this folder only render a
// LocalGame and send events.
//
// Like one-phone Imposter, this runs in the browser rather than on the server.
// "The server is authoritative" protects phones from each other, and here everyone
// is holding the same phone.
//
// A round: one player is the Psychic and everyone else is a Clue Giver. The Clue
// Givers get a secret number from 1 to 10. The Psychic names a category, and each
// Clue Giver privately answers with something from that category that matches the
// number on a scale from least to most favourite. After three categories the
// Psychic guesses the number. Everyone takes one turn as the Psychic.
//
// With spoken answers the categories and answers happen out loud, so the app only
// deals the number and takes the guess, and a round skips straight from one to
// the other.

import type { SeatBounds } from "../../onephone/seats";

export const MIN_PLAYERS = 3;
/** Every round asks each Clue Giver for three typed answers, and everyone has a
 * turn as the Psychic, so a game grows with the square of the table. Eight is
 * already a long evening. */
export const MAX_PLAYERS = 8;
export const SEAT_BOUNDS: SeatBounds = { min: MIN_PLAYERS, max: MAX_PLAYERS };

/** The secret number's range, inclusive at both ends. */
export const LOWEST = 1;
export const HIGHEST = 10;

/** How many categories the Psychic asks about before guessing. */
export const CATEGORIES_PER_ROUND = 3;

/** Long enough for "Things you find in a fridge". */
export const MAX_CATEGORY_LENGTH = 32;
/** Long enough for a film title, short enough to read across the table. */
export const MAX_ANSWER_LENGTH = 40;

/** "random": the app draws the number and shows it to each Clue Giver.
 * "chosen": the Clue Givers agree on one out of the Psychic's earshot, and the
 * first of them enters it. */
export type SecretSource = "random" | "chosen";

/** "typed": each Clue Giver types their answers into the app in private, and the
 * app shows them to everyone and keeps them for the guess.
 * "spoken": the table talks. The app only holds the number and takes the guess,
 * and everything between happens out loud. */
export type AnswerMode = "typed" | "spoken";

export interface LocalSettings {
  secret: SecretSource;
  answers: AnswerMode;
}

export const DEFAULT_SETTINGS: LocalSettings = { secret: "random", answers: "typed" };

export interface Round {
  /** The Psychic's seat. Round r's Psychic is seat r, so everyone gets one turn. */
  psychic: number;
  /** null only while the Clue Givers still have to enter the one they chose. */
  secret: number | null;
  /** In the order the Psychic picked them. Its length says how far the round is. */
  categories: string[];
  /** answers[c][g] is Clue Giver g's answer for categories[c], with g an index
   * into cluesGivers(). A category's list fills up one answer at a time. */
  answers: string[][];
  /** The Psychic's final guess, once made. */
  guess: number | null;
}

export type Stage =
  /** Phone on the table: who is the Psychic this round. */
  | { kind: "intro" }
  /** Clue Giver `giver` holds the phone to see, or enter, the secret number. */
  | { kind: "secret"; giver: number }
  /** Spoken answers only: the phone is on the table while the round is talked
   * through, until the Psychic is ready to guess. */
  | { kind: "talk" }
  /** The Psychic types the next category. */
  | { kind: "category" }
  /** Clue Giver `giver` answers the newest category in private. */
  | { kind: "answer"; giver: number }
  /** Everyone sees the answers to the newest category. */
  | { kind: "reveal" }
  /** The Psychic picks a number. */
  | { kind: "guess" }
  /** The number is out and the round is scored. */
  | { kind: "result" }
  /** Everyone has been the Psychic once. */
  | { kind: "final" };

export interface LocalGame {
  /** Final display names. A player's index in this array is their seat. */
  names: string[];
  settings: LocalSettings;
  /** 0-based. Also the current Psychic's seat. */
  roundIndex: number;
  /** Running total per seat. */
  scores: number[];
  round: Round;
  stage: Stage;
}

export type LocalEvent =
  | { type: "begin" }
  | { type: "chooseSecret"; value: number }
  | { type: "secretSeen" }
  | { type: "readyToGuess" }
  | { type: "setCategory"; text: string }
  | { type: "submitAnswer"; text: string }
  | { type: "continue" }
  | { type: "guess"; value: number }
  | { type: "nextRound" };

/** The randomness source, so tests can decide the outcome. Returns [0, 1). */
export type Rng = () => number;

export function isInRange(value: number): boolean {
  return Number.isInteger(value) && value >= LOWEST && value <= HIGHEST;
}

function drawSecret(rng: Rng): number {
  return LOWEST + Math.floor(rng() * (HIGHEST - LOWEST + 1));
}

function newRound(psychic: number, settings: LocalSettings, rng: Rng): Round {
  return {
    psychic,
    secret: settings.secret === "random" ? drawSecret(rng) : null,
    categories: [],
    answers: [],
    guess: null,
  };
}

/** Start a game with seat 0 as the first Psychic. */
export function newGame(names: readonly string[], settings: LocalSettings, rng: Rng = Math.random): LocalGame {
  return {
    names: [...names],
    settings,
    roundIndex: 0,
    scores: names.map(() => 0),
    round: newRound(0, settings, rng),
    stage: { kind: "intro" },
  };
}

/** How many rounds a game has: one per player. */
export function totalRounds(game: LocalGame): number {
  return game.names.length;
}

/** The Clue Givers' seats, going round the table from the Psychic's left. Their
 * order is the order the phone travels in. */
export function clueGivers(game: LocalGame): number[] {
  const n = game.names.length;
  return Array.from({ length: n - 1 }, (_, i) => (game.round.psychic + 1 + i) % n);
}

/** The category being answered or revealed right now, or "" before the first. */
export function currentCategory(round: Round): string {
  return round.categories[round.categories.length - 1] ?? "";
}

/** Why a category can't be used, or null if it can. The same name twice in one
 * round would only ask the same question again. */
export type CategoryProblem = "empty" | "tooLong" | "repeated";

export function categoryProblem(round: Round, text: string): CategoryProblem | null {
  const name = text.trim();
  if (name === "") return "empty";
  if ([...name].length > MAX_CATEGORY_LENGTH) return "tooLong";
  const key = name.toLocaleLowerCase();
  if (round.categories.some((c) => c.toLocaleLowerCase() === key)) return "repeated";
  return null;
}

export type AnswerProblem = "empty" | "tooLong";

export function answerProblem(text: string): AnswerProblem | null {
  const answer = text.trim();
  if (answer === "") return "empty";
  if ([...answer].length > MAX_ANSWER_LENGTH) return "tooLong";
  return null;
}

/** What each seat scores for a guess. A right guess is worth one point to the
 * Psychic for every Clue Giver they read; a wrong one is worth one point to each
 * Clue Giver. Both sides can win the same total, so the round is fair whatever
 * the size of the table, and over a whole game everyone has the same chances. */
export function roundPoints(game: LocalGame, guess: number): number[] {
  const givers = clueGivers(game);
  const points = game.names.map(() => 0);
  if (guess === game.round.secret) {
    points[game.round.psychic] = givers.length;
  } else {
    for (const seat of givers) points[seat] = 1;
  }
  return points;
}

/** Whether the Psychic got it. Only meaningful once a guess is in. */
export function psychicWon(round: Round): boolean {
  return round.guess !== null && round.guess === round.secret;
}

/** The seats with the highest score. More than one is a shared win. */
export function leaders(scores: readonly number[]): number[] {
  const best = Math.max(...scores);
  return scores.flatMap((score, seat) => (score === best ? [seat] : []));
}

/** Where the phone goes after Clue Giver `giver` is done with the secret. */
function afterSecret(game: LocalGame, giver: number): Stage {
  if (giver + 1 < clueGivers(game).length) return { kind: "secret", giver: giver + 1 };
  return game.settings.answers === "spoken" ? { kind: "talk" } : { kind: "category" };
}

/** The rules. An event that makes no sense for the current stage returns the game
 * unchanged, the way a server would refuse it: a second tap on a button that has
 * already moved on, or a category that breaks the rules above. `rng` is only used
 * to draw the next round's number. */
export function step(game: LocalGame, event: LocalEvent, rng: Rng = Math.random): LocalGame {
  const { stage, round } = game;
  switch (event.type) {
    case "begin":
      if (stage.kind !== "intro") return game;
      return { ...game, stage: { kind: "secret", giver: 0 } };

    case "chooseSecret":
      // Only the first Clue Giver enters a chosen number. Everyone after them is
      // shown it, which is how the group checks they all agreed on the same one.
      if (stage.kind !== "secret" || stage.giver !== 0) return game;
      if (game.settings.secret !== "chosen" || round.secret !== null) return game;
      if (!isInRange(event.value)) return game;
      return { ...game, round: { ...round, secret: event.value }, stage: afterSecret(game, 0) };

    case "secretSeen":
      if (stage.kind !== "secret" || round.secret === null) return game;
      return { ...game, stage: afterSecret(game, stage.giver) };

    case "readyToGuess":
      // The app has no record of a spoken round, so it cannot hold the Psychic to
      // three categories. The table keeps that rule, as it would on paper.
      if (stage.kind !== "talk") return game;
      return { ...game, stage: { kind: "guess" } };

    case "setCategory": {
      if (stage.kind !== "category") return game;
      if (categoryProblem(round, event.text) !== null) return game;
      return {
        ...game,
        round: {
          ...round,
          categories: [...round.categories, event.text.trim()],
          answers: [...round.answers, []],
        },
        stage: { kind: "answer", giver: 0 },
      };
    }

    case "submitAnswer": {
      if (stage.kind !== "answer") return game;
      if (answerProblem(event.text) !== null) return game;
      const last = round.answers.length - 1;
      const answers = round.answers.map((list, i) => (i === last ? [...list, event.text.trim()] : list));
      const next: Stage =
        stage.giver + 1 < clueGivers(game).length
          ? { kind: "answer", giver: stage.giver + 1 }
          : { kind: "reveal" };
      return { ...game, round: { ...round, answers }, stage: next };
    }

    case "continue":
      if (stage.kind !== "reveal") return game;
      return {
        ...game,
        stage: round.categories.length < CATEGORIES_PER_ROUND ? { kind: "category" } : { kind: "guess" },
      };

    case "guess": {
      if (stage.kind !== "guess" || !isInRange(event.value)) return game;
      const points = roundPoints(game, event.value);
      return {
        ...game,
        scores: game.scores.map((score, seat) => score + points[seat]),
        round: { ...round, guess: event.value },
        stage: { kind: "result" },
      };
    }

    case "nextRound": {
      if (stage.kind !== "result") return game;
      const roundIndex = game.roundIndex + 1;
      if (roundIndex >= totalRounds(game)) return { ...game, stage: { kind: "final" } };
      return {
        ...game,
        roundIndex,
        round: newRound(roundIndex, game.settings, rng),
        stage: { kind: "intro" },
      };
    }
  }
}
