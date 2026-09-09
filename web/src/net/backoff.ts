// Exponential backoff with jitter, used to space out reconnection attempts.
// Pure and side-effect free so it can be unit tested without timers.

export interface BackoffOptions {
  /** Delay for the first retry, in ms. */
  baseMs?: number;
  /** Upper bound on any single delay, in ms. */
  maxMs?: number;
  /** Multiplier applied per attempt. */
  factor?: number;
  /** Fraction of random spread, 0..1. 0.5 means the delay varies by +-50%. */
  jitter?: number;
  /** Injectable randomness for tests. Returns 0..1. Defaults to Math.random. */
  random?: () => number;
}

export class Backoff {
  #attempt = 0;
  readonly #baseMs: number;
  readonly #maxMs: number;
  readonly #factor: number;
  readonly #jitter: number;
  readonly #random: () => number;

  constructor(opts: BackoffOptions = {}) {
    this.#baseMs = opts.baseMs ?? 500;
    this.#maxMs = opts.maxMs ?? 15_000;
    this.#factor = opts.factor ?? 2;
    this.#jitter = opts.jitter ?? 0.5;
    this.#random = opts.random ?? Math.random;
  }

  /** Delay in ms for the next attempt, then advances the attempt counter. */
  next(): number {
    const raw = this.#baseMs * Math.pow(this.#factor, this.#attempt);
    const capped = Math.min(raw, this.#maxMs);
    // random() in [0,1) -> spread in [-jitter, +jitter)
    const spread = (this.#random() * 2 - 1) * this.#jitter;
    const delay = Math.max(0, Math.round(capped * (1 + spread)));
    this.#attempt++;
    return delay;
  }

  /** Call after a successful connection so the next failure starts over. */
  reset(): void {
    this.#attempt = 0;
  }

  get attempt(): number {
    return this.#attempt;
  }
}
