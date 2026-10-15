// How long a match can be. These mirror the server's own bounds
// (server/internal/games/imposter/score.go: defaultRounds, maxRounds) — the
// server corrects anything out of range rather than failing the start, so a
// drift here degrades to a sane match instead of a broken one.

export const DEFAULT_ROUNDS = 3;

/** The match lengths the host can pick between. Every player is the imposter
 * roughly once per group-size rounds, so these are "a quick one", "everyone
 * gets a turn", and "a proper session". */
export const ROUND_OPTIONS = [3, 5, 7] as const;
