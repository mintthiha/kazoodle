/** The hues a player can be. Yellow and red are missing on purpose: those are
 * the game's own colours (live/winning and the imposter), and a player who
 * happened to be red would read as a spoiler. Listed in hue order; the slot a
 * player takes is decided by their id, not by this order. */
const HUES = [145, 175, 205, 235, 285, 325, 15, 85];

/** A small, stable string hash. This only picks a colour, so collisions are
 * harmless: they are resolved below. */
function hash(id: string): number {
  let h = 0;
  for (const ch of id) {
    h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  }
  return h;
}

/** Give every id its own hue.
 *
 * Every phone in the room has to agree without talking about it, so the answer
 * has to depend only on the set of ids: they are sorted first, then each takes
 * the slot its hash points at, or the next free one. Past the eighth player the
 * hues start repeating, which is better than running out. */
export function assignHues(ids: string[]): Map<string, number> {
  const out = new Map<string, number>();
  const taken = new Set<number>();

  for (const id of [...new Set(ids)].sort()) {
    if (taken.size === HUES.length) taken.clear();
    let slot = hash(id) % HUES.length;
    while (taken.has(slot)) slot = (slot + 1) % HUES.length;
    taken.add(slot);
    out.set(id, HUES[slot]);
  }
  return out;
}

/** A hue lookup for one render. An id nobody has heard of still gets a colour
 * rather than an unstyled avatar: it can turn up in a recap after a departure
 * older than this connection remembers. */
export function makeHueFor(
  players: { id: string }[],
  departed: { id: string }[],
): (id: string) => number {
  const hues = assignHues([...players, ...departed].map((p) => p.id));
  return (id) => hues.get(id) ?? HUES[hash(id) % HUES.length];
}
