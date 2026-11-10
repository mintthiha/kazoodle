// Fibblash's wire messages, carried inside the core protocol's GameEvent /
// GameAction envelopes as proto3 JSON. Shapes come from ./gen/fibblash_pb,
// never hand-written.

import { create, fromJsonString, toJsonString, type MessageInitShape } from "@bufbuild/protobuf";
import {
  FibblashClientMessageSchema,
  FibblashServerMessageSchema,
  StartOptionsSchema,
  type FibblashServerMessage,
} from "./gen/fibblash_pb";

/** The match lengths the lobby offers. The server accepts 3 to 20. */
export const QUESTION_COUNTS = [8, 12, 16] as const;
export type QuestionCount = (typeof QUESTION_COUNTS)[number];

export interface MatchOptions {
  questions: QuestionCount;
}

/** Twelve questions is the spec's 15–20 minutes. */
export const DEFAULT_MATCH_OPTIONS: MatchOptions = { questions: 12 };

/** The options as StartGame and SetGameOptions carry them. */
export function encodeStartOptions(opts: MatchOptions): string {
  return toJsonString(StartOptionsSchema, create(StartOptionsSchema, { questions: opts.questions }));
}

/** The inverse of encodeStartOptions. Empty, malformed or unknown input decodes
 * to the defaults rather than throwing: a stray payload must not crash the lobby. */
export function decodeStartOptions(json: string): MatchOptions {
  if (!json) return DEFAULT_MATCH_OPTIONS;
  try {
    const n = fromJsonString(StartOptionsSchema, json).questions;
    const known = QUESTION_COUNTS.find((c) => c === n);
    return known ? { questions: known } : DEFAULT_MATCH_OPTIONS;
  } catch {
    return DEFAULT_MATCH_OPTIONS;
  }
}

export const fibblashDefaultOptions = encodeStartOptions(DEFAULT_MATCH_OPTIONS);

/** Decode one game-event payload string into a typed Fibblash server message. */
export function decodeFibblashEvent(payload: string): FibblashServerMessage {
  return fromJsonString(FibblashServerMessageSchema, payload);
}

// Every client message goes through here: build it from its oneof case, then
// to JSON. `body` is typed from the generated schema, so a misspelt case or a
// wrong field is a compile error.
type ClientBody = MessageInitShape<typeof FibblashClientMessageSchema>["body"];

function encode(body: ClientBody): string {
  return toJsonString(FibblashClientMessageSchema, create(FibblashClientMessageSchema, { body }));
}

/** This player's answer to the question: a lie, or a joke. */
export const encodeSubmitAnswer = (text: string) => encode({ case: "submitAnswer", value: { text } });

/** This player's vote in the open ballot. */
export const encodeCastVote = (choiceId: string) => encode({ case: "castVote", value: { choiceId } });

/** Host: end the current phase now. */
export const encodeHostNext = () => encode({ case: "hostNext", value: {} });

/** Host: drop this question and show the leaderboard. */
export const encodeHostSkip = () => encode({ case: "hostSkip", value: {} });

/** Host: end the match now. */
export const encodeHostEnd = () => encode({ case: "hostEnd", value: {} });

/** Host, on the final standings: back to the lobby. */
export const encodeFinish = () => encode({ case: "finish", value: {} });
