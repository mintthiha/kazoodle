// Imposter's own wire messages, carried inside the core protocol's GameEvent /
// GameAction envelopes as proto3 JSON. Shapes come from ./gen/imposter_pb —
// never hand-written.

import { create, fromJsonString, toJsonString } from "@bufbuild/protobuf";
import {
  ImposterClientMessageSchema,
  ImposterServerMessageSchema,
  StartOptionsSchema,
  type ImposterServerMessage,
} from "./gen/imposter_pb";
import { DEFAULT_CLUE_PASSES, DEFAULT_CLUE_SECONDS, DEFAULT_ROUNDS } from "./rounds";

/** The host's choices for a match: everything StartOptions carries, as the
 * lobby holds it. One object rather than three arguments because the lobby
 * broadcasts the whole set on every change. */
export interface MatchOptions {
  hintsEnabled: boolean;
  category: string;
  /** How many rounds the match runs for. See ./rounds. */
  rounds: number;
  /** How many clues each player gives before the vote. See ./rounds. */
  cluePasses: number;
  /** Seconds allowed per clue turn, or 0 for no clock. See ./rounds. */
  clueSeconds: number;
}

/** What a match is if the host touches nothing. */
export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  hintsEnabled: false,
  category: "",
  rounds: DEFAULT_ROUNDS,
  cluePasses: DEFAULT_CLUE_PASSES,
  clueSeconds: DEFAULT_CLUE_SECONDS,
};

/** Decode one game-event payload string into a typed Imposter server message. */
export function decodeImposterEvent(payload: string): ImposterServerMessage {
  return fromJsonString(ImposterServerMessageSchema, payload);
}

/** The host's chosen options for a match. Passed as StartGame's `options` to
 * begin it, and also as SetGameOptions' `options` while still in the lobby so
 * everyone can see the pending choice before the host starts. */
export function encodeStartOptions(opts: MatchOptions): string {
  return toJsonString(StartOptionsSchema, create(StartOptionsSchema, opts));
}

/** The inverse of encodeStartOptions: reads a lobby's pending (or a running
 * match's applied) options back out. Malformed or empty input decodes to the
 * defaults rather than throwing — a stray or stale payload should never crash
 * the lobby screen.
 *
 * A zero `rounds` or `cluePasses` is the proto default, which the server reads
 * as "use yours"; both become the matching default here so the lobby shows
 * what will actually be played rather than a bare 0. */
export function decodeStartOptions(json: string): MatchOptions {
  if (!json) return DEFAULT_MATCH_OPTIONS;
  try {
    const opts = fromJsonString(StartOptionsSchema, json);
    return {
      hintsEnabled: opts.hintsEnabled,
      category: opts.category,
      rounds: opts.rounds || DEFAULT_ROUNDS,
      cluePasses: opts.cluePasses || DEFAULT_CLUE_PASSES,
      // No `||` fallback here: zero is a real choice (no clock), not an
      // unset field standing in for a default.
      clueSeconds: opts.clueSeconds,
    };
  } catch {
    return DEFAULT_MATCH_OPTIONS;
  }
}

/** "I have seen my role." */
export function encodeMarkReady(): string {
  return toJsonString(
    ImposterClientMessageSchema,
    create(ImposterClientMessageSchema, { body: { case: "markReady", value: {} } }),
  );
}

/** One clue word, sent on this player's turn. */
export function encodeSubmitClue(text: string): string {
  return toJsonString(
    ImposterClientMessageSchema,
    create(ImposterClientMessageSchema, { body: { case: "submitClue", value: { text } } }),
  );
}

/** A vote for who the imposter is. Sending again before everyone has voted
 * replaces this player's previous vote. */
export function encodeCastVote(suspectId: string): string {
  return toJsonString(
    ImposterClientMessageSchema,
    create(ImposterClientMessageSchema, { body: { case: "castVote", value: { suspectId } } }),
  );
}

/** "I'm not accusing anyone this round." Also replaceable, same as a vote. */
export function encodeAbstain(): string {
  return toJsonString(
    ImposterClientMessageSchema,
    create(ImposterClientMessageSchema, { body: { case: "castVote", value: { abstain: true } } }),
  );
}

/** The caught imposter's one blind guess at the secret word. */
export function encodeGuessWord(text: string): string {
  return toJsonString(
    ImposterClientMessageSchema,
    create(ImposterClientMessageSchema, { body: { case: "guessWord", value: { text } } }),
  );
}

/** "Start a new round." Only accepted once the round has reached its outcome. */
export function encodePlayAgain(): string {
  return toJsonString(
    ImposterClientMessageSchema,
    create(ImposterClientMessageSchema, { body: { case: "playAgain", value: {} } }),
  );
}
