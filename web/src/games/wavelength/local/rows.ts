import { makeSeatHue } from "../../onephone/seatHue";
import type { BoardCategory } from "../Board";
import type { StandingRow } from "../Standings";
import { clueGivers, type LocalGame } from "./localGame";

// One-phone Wavelength's state turned into what the shared Board and Standings
// draw. A seat number is all the id a player has here.

/** Every category of the round so far, oldest first, with each Clue Giver's answer. */
export function boardOf(game: LocalGame): BoardCategory[] {
  const { names, round } = game;
  const givers = clueGivers(game);
  const hue = makeSeatHue(names.length);
  return round.categories.map((name, c) => ({
    name,
    answers: givers.map((seat, g) => ({
      key: String(seat),
      name: names[seat],
      hue: hue(seat),
      text: round.answers[c]?.[g] ?? "",
    })),
  }));
}

/** The standings, highest first. Ties keep seat order, so two players on the same
 * score never swap places between one round and the next for no reason. */
export function standingsOf(names: string[], scores: number[], deltas?: number[]): StandingRow[] {
  const hue = makeSeatHue(names.length);
  return names
    .map((_, seat) => seat)
    .sort((a, b) => scores[b] - scores[a] || a - b)
    .map((seat) => ({
      key: String(seat),
      name: names[seat],
      hue: hue(seat),
      score: scores[seat],
      delta: deltas?.[seat],
    }));
}
