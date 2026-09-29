import { describe, expect, it } from "vitest";
import {
  decodeServerMessage,
  encodeCreateRoom,
  encodeEcho,
  encodeGameAction,
  encodeJoinRoom,
  encodeLeaveRoom,
  encodeStartGame,
} from "./messages";

describe("encode", () => {
  it("createRoom", () => {
    expect(JSON.parse(encodeCreateRoom("Ana", "en"))).toEqual({
      createRoom: { displayName: "Ana", locale: "en" },
    });
  });

  it("joinRoom", () => {
    expect(JSON.parse(encodeJoinRoom("ABCD", "Ben", "fr"))).toEqual({
      joinRoom: { roomCode: "ABCD", displayName: "Ben", locale: "fr" },
    });
  });

  it("leaveRoom is an empty payload", () => {
    expect(JSON.parse(encodeLeaveRoom())).toEqual({ leaveRoom: {} });
  });

  it("echo", () => {
    expect(JSON.parse(encodeEcho("hi"))).toEqual({ echo: { text: "hi" } });
  });

  it("startGame with no options", () => {
    expect(JSON.parse(encodeStartGame("imposter"))).toEqual({ startGame: { gameId: "imposter" } });
  });

  it("startGame carries a game's options string verbatim", () => {
    expect(JSON.parse(encodeStartGame("imposter", '{"hintsEnabled":true}'))).toEqual({
      startGame: { gameId: "imposter", options: '{"hintsEnabled":true}' },
    });
  });

  it("gameAction wraps a game payload string verbatim", () => {
    expect(JSON.parse(encodeGameAction("imposter", '{"markReady":{}}'))).toEqual({
      gameAction: { gameId: "imposter", payload: '{"markReady":{}}' },
    });
  });
});

describe("decodeServerMessage", () => {
  it("parses a roomJoined frame into a typed oneof", () => {
    const raw = JSON.stringify({
      roomJoined: {
        roomCode: "ABCD",
        selfPlayerId: "p1",
        players: [{ id: "p1", displayName: "Ana" }],
      },
    });
    const msg = decodeServerMessage(raw);
    expect(msg.payload.case).toBe("roomJoined");
    if (msg.payload.case !== "roomJoined") throw new Error("unreachable");
    expect(msg.payload.value.roomCode).toBe("ABCD");
    expect(msg.payload.value.players[0].displayName).toBe("Ana");
  });

  it("parses an error frame", () => {
    const msg = decodeServerMessage(JSON.stringify({ error: { code: "room_not_found" } }));
    expect(msg.payload.case).toBe("error");
    if (msg.payload.case !== "error") throw new Error("unreachable");
    expect(msg.payload.value.code).toBe("room_not_found");
  });

  it("throws on a malformed frame", () => {
    expect(() => decodeServerMessage("not json")).toThrow();
  });
});
