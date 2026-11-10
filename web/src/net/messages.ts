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

// screen = true joins as a main screen: a shared display that shows the game
// but is never dealt in as a player.
export function encodeCreateRoom(displayName: string, locale: string, screen = false): string {
  return toJsonString(
    ClientMessageSchema,
    create(ClientMessageSchema, {
      payload: { case: "createRoom", value: { displayName, locale, screen } },
    }),
  );
}

export function encodeJoinRoom(roomCode: string, displayName: string, locale: string, screen = false): string {
  return toJsonString(
    ClientMessageSchema,
    create(ClientMessageSchema, {
      payload: { case: "joinRoom", value: { roomCode, displayName, locale, screen } },
    }),
  );
}

/** Reclaim a held seat after the connection dropped. */
export function encodeResumeRoom(roomCode: string, sessionToken: string): string {
  return toJsonString(
    ClientMessageSchema,
    create(ClientMessageSchema, {
      payload: { case: "resumeRoom", value: { roomCode, sessionToken } },
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

// options is the proto3-JSON of a game-specific start-options message,
// produced by that game's own encoder. Omit it to use that game's defaults.
export function encodeStartGame(gameId: string, options = ""): string {
  return toJsonString(
    ClientMessageSchema,
    create(ClientMessageSchema, {
      payload: { case: "startGame", value: { gameId, options } },
    }),
  );
}

// options is the proto3-JSON of a game-specific start-options message — the
// same shape encodeStartGame's options takes. Sent as the host changes their
// pick (e.g. Imposter's category) so the rest of the lobby sees it live,
// before the game actually starts.
export function encodeSetGameOptions(gameId: string, options: string): string {
  return toJsonString(
    ClientMessageSchema,
    create(ClientMessageSchema, {
      payload: { case: "setGameOptions", value: { gameId, options } },
    }),
  );
}

// payload is the proto3-JSON of a game-specific client message, produced by
// that game's own encoder.
export function encodeGameAction(gameId: string, payload: string): string {
  return toJsonString(
    ClientMessageSchema,
    create(ClientMessageSchema, {
      payload: { case: "gameAction", value: { gameId, payload } },
    }),
  );
}

/** Host only: remove a player from the room. */
export function encodeKickPlayer(playerId: string): string {
  return toJsonString(
    ClientMessageSchema,
    create(ClientMessageSchema, {
      payload: { case: "kickPlayer", value: { playerId } },
    }),
  );
}

/** Parse one frame from the server. Throws if the text is not a valid message. */
export function decodeServerMessage(raw: string): ServerMessage {
  return fromJsonString(ServerMessageSchema, raw);
}
