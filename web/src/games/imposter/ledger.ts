/** One person's line in the clue ledger: who, and what they have said so far. */
export interface LedgerRow {
  id: string;
  /** In the order they said them. An empty string is a turn whose clock ran
   * out: the server records the miss so that stalling stays visible. */
  texts: string[];
}

/** Fold the server's flat clue list into one row per person.
 *
 * `order` is who gets a row and in what order, including people who have not
 * spoken yet. Someone with clues who is not in `order` (they left the room, and
 * are no longer a candidate) still gets a row at the end: their clues stay on
 * the table because the rest of the room heard them. */
export function buildLedger(
  order: string[],
  clues: { playerId: string; text: string }[],
): LedgerRow[] {
  const rows = new Map<string, LedgerRow>();
  for (const id of order) rows.set(id, { id, texts: [] });

  for (const clue of clues) {
    let row = rows.get(clue.playerId);
    if (!row) {
      row = { id: clue.playerId, texts: [] };
      rows.set(clue.playerId, row);
    }
    row.texts.push(clue.text);
  }
  return [...rows.values()];
}
