// The only place that turns app calls into wire bytes and wire bytes back into
// values. Every shape here comes from the generated protocol types
// (./gen/protocol_pb) — nothing on the wire is hand-defined.
//
// Format is proto3 canonical JSON, matching the Go server.

import { create, fromJsonString, toJsonString } from "@bufbuild/protobuf";
import {
  ClientMessageSchema,
  ServerMessageSchema,
  type ServerMessage,
} from "./gen/protocol_pb";

export function encodeCreateRoom(displayName: string): string {
  return toJsonString(
    ClientMessageSchema,
    create(ClientMessageSchema, {
      payload: { case: "createRoom", value: { displayName } },
    }),
  );
}

export function encodeJoinRoom(roomCode: string, displayName: string): string {
  return toJsonString(
    ClientMessageSchema,
    create(ClientMessageSchema, {
      payload: { case: "joinRoom", value: { roomCode, displayName } },
    }),
  );
}

export function encodeLeaveRoom(): string {
  return toJsonString(
    ClientMessageSchema,
    create(ClientMessageSchema, {
      payload: { case: "leaveRoom", value: {} },
    }),
  );
}

export function encodeEcho(text: string): string {
  return toJsonString(
    ClientMessageSchema,
    create(ClientMessageSchema, {
      payload: { case: "echo", value: { text } },
    }),
  );
}

/** Parse one frame from the server. Throws if the text is not a valid message. */
export function decodeServerMessage(raw: string): ServerMessage {
  return fromJsonString(ServerMessageSchema, raw);
}
