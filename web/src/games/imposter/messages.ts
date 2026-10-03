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

/** Decode one game-event payload string into a typed Imposter server message. */
export function decodeImposterEvent(payload: string): ImposterServerMessage {
  return fromJsonString(ImposterServerMessageSchema, payload);
}

/** The host's chosen options for a round. Passed as StartGame's `options` to
 * begin the round, and also as SetGameOptions' `options` while still in the
 * lobby so everyone can see the pending choice before the host starts. */
export function encodeStartOptions(hintsEnabled: boolean, category = ""): string {
  return toJsonString(
    StartOptionsSchema,
    create(StartOptionsSchema, { hintsEnabled, category }),
  );
}

/** The inverse of encodeStartOptions: reads a lobby's pending (or a round's
 * applied) options back out. Malformed or empty input decodes to defaults
 * (no hints, any category) rather than throwing — a stray or stale payload
 * should never crash the lobby screen. */
export function decodeStartOptions(json: string): { hintsEnabled: boolean; category: string } {
  if (!json) return { hintsEnabled: false, category: "" };
  try {
    const opts = fromJsonString(StartOptionsSchema, json);
    return { hintsEnabled: opts.hintsEnabled, category: opts.category };
  } catch {
    return { hintsEnabled: false, category: "" };
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
