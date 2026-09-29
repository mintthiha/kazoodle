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

/** The host's chosen options for a round, passed as StartGame's `options`. */
export function encodeStartOptions(hintsEnabled: boolean): string {
  return toJsonString(
    StartOptionsSchema,
    create(StartOptionsSchema, { hintsEnabled }),
  );
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
