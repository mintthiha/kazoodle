// Imposter's own wire messages, carried inside the core protocol's GameEvent /
// GameAction envelopes as proto3 JSON. Shapes come from ./gen/imposter_pb —
// never hand-written.

import { create, fromJsonString, toJsonString } from "@bufbuild/protobuf";
import {
  ImposterClientMessageSchema,
  ImposterServerMessageSchema,
  type ImposterServerMessage,
} from "./gen/imposter_pb";

/** Decode one game-event payload string into a typed Imposter server message. */
export function decodeImposterEvent(payload: string): ImposterServerMessage {
  return fromJsonString(ImposterServerMessageSchema, payload);
}

/** "I have seen my role." Returned as a payload string for GameAction. */
export function encodeMarkReady(): string {
  return toJsonString(
    ImposterClientMessageSchema,
    create(ImposterClientMessageSchema, { body: { case: "markReady", value: {} } }),
  );
}
