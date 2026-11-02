import { makeHueFor } from "../../../players/hues";

/** A hue lookup by seat number. The players/ colours are keyed by id, and in this
 * mode a seat number is all the id a player has. */
export function makeSeatHue(count: number): (seat: number) => number {
  const players = Array.from({ length: count }, (_, i) => ({ id: String(i) }));
  const hue = makeHueFor(players, []);
  return (seat) => hue(String(seat));
}
