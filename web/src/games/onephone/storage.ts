// Browser storage for one-phone games, which have no server to remember anything.
//
// Storage can throw (private browsing, blocked site data), so both directions
// swallow the error: a read answers "nothing saved" and a write is dropped. The
// game plays on either way, and only a reload would notice.

/** The stored string under `key`, or null if there is none or storage is blocked.
 * `store` is a function so that merely touching `localStorage` cannot throw
 * before the try block, which it can in some locked-down browsers. */
export function readStored(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

/** Stores `value` under `key`, or removes the key when `value` is null. */
export function writeStored(store: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, value);
  } catch {
    // Nothing to do about it. See the file comment.
  }
}
