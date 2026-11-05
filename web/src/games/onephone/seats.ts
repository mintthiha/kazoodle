// Who is sitting round the table, for any game played on one phone passed between
// people. A player here has no account and no id: their seat number is who they
// are, and their name is whatever was typed into setup.

/** Mirrors the server's longest display name (room/guest.go's maxNameLen). */
export const MAX_NAME_LENGTH = 24;

/** How many seats a game allows. Each game sets its own: a device passed round
 * a big table is fine for a quick round of Imposter and slow for a game where
 * everyone types. */
export interface SeatBounds {
  min: number;
  max: number;
}

/** The names the game will use: trimmed, with a blank seat falling back to
 * `fallback`, which is given the seat's 1-based number. Nobody has to type a name
 * to play, the same promise the online join screen makes. */
export function resolveNames(raw: readonly string[], fallback: (n: number) => string): string[] {
  return raw.map((name, i) => name.trim() || fallback(i + 1));
}

/** Seats whose name is also used by another seat, ignoring case. Two people
 * called "Sam" cannot be told apart on screen, so setup asks for a change. */
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

/** Grow or shrink the list of names to `count`, kept within `bounds`, keeping
 * what was already typed. Dropping a seat and adding it back again loses that one
 * name, on purpose: the stepper means "fewer people", not "hide this person". */
export function resizeNames(names: readonly string[], count: number, bounds: SeatBounds): string[] {
  const bounded = Math.min(bounds.max, Math.max(bounds.min, count));
  return Array.from({ length: bounded }, (_, i) => names[i] ?? "");
}
