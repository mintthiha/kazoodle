// Online Wavelength's wire messages, carried inside the core protocol's
// GameEvent / GameAction envelopes as proto3 JSON. Shapes come from
// ./gen/wavelength_pb, never hand-written.

import { create, fromJsonString, toJsonString, type MessageInitShape } from "@bufbuild/protobuf";
import {
  StartOptionsSchema,
  WavelengthClientMessageSchema,
  WavelengthServerMessageSchema,
  type WavelengthServerMessage,
} from "./gen/wavelength_pb";
import { DEFAULT_SETTINGS, type LocalSettings } from "./local/localGame";

/** The host's choices, in the same shape the one-phone setup uses, so both
 * versions describe a game the same way. */
export type MatchOptions = LocalSettings;

export const DEFAULT_MATCH_OPTIONS: MatchOptions = DEFAULT_SETTINGS;

/** The options as StartGame and SetGameOptions carry them. */
export function encodeStartOptions(opts: MatchOptions): string {
  return toJsonString(
    StartOptionsSchema,
    create(StartOptionsSchema, {
      spokenAnswers: opts.answers === "spoken",
      chosenSecret: opts.secret === "chosen",
    }),
  );
}

/** The inverse of encodeStartOptions. Empty or malformed input decodes to the
 * defaults rather than throwing: a stray payload must not crash the lobby. */
export function decodeStartOptions(json: string): MatchOptions {
  if (!json) return DEFAULT_MATCH_OPTIONS;
  try {
    const opts = fromJsonString(StartOptionsSchema, json);
    return {
      answers: opts.spokenAnswers ? "spoken" : "typed",
      secret: opts.chosenSecret ? "chosen" : "random",
    };
  } catch {
    return DEFAULT_MATCH_OPTIONS;
  }
}

export const wavelengthDefaultOptions = encodeStartOptions(DEFAULT_MATCH_OPTIONS);

/** Decode one game-event payload string into a typed Wavelength server message. */
export function decodeWavelengthEvent(payload: string): WavelengthServerMessage {
  return fromJsonString(WavelengthServerMessageSchema, payload);
}

// Every client message goes through here: build it from its oneof case, then
// to JSON. `body` is typed from the generated schema (the shape `create`
// accepts), so a misspelt case or a wrong field is a compile error.
type ClientBody = MessageInitShape<typeof WavelengthClientMessageSchema>["body"];

function encode(body: ClientBody): string {
  return toJsonString(WavelengthClientMessageSchema, create(WavelengthClientMessageSchema, { body }));
}

/** The number the Clue Givers agreed on, from the one entering it. */
export const encodeChooseSecret = (value: number) => encode({ case: "chooseSecret", value: { value } });

/** The Psychic's next category. */
export const encodeSetCategory = (text: string) => encode({ case: "setCategory", value: { text } });

/** One Clue Giver's answer to the open category. */
export const encodeSubmitAnswer = (text: string) => encode({ case: "submitAnswer", value: { text } });

/** Spoken rounds: the Psychic is done listening. */
export const encodeReadyToGuess = () => encode({ case: "readyToGuess", value: {} });

/** The Psychic's one guess. */
export const encodeMakeGuess = (value: number) => encode({ case: "makeGuess", value: { value } });

/** "On to the next round", or out of the match after the last one. */
export const encodePlayAgain = () => encode({ case: "playAgain", value: {} });
