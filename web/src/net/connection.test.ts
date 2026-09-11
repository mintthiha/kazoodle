import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Connection, type SocketLike } from "./connection";

// A hand-driven stand-in for WebSocket. Nothing is asynchronous: the test
// calls open()/receive()/drop() to make events happen. close() only marks the
// socket closed, matching the browser (the close *event* is a separate thing).
class FakeSocket implements SocketLike {
  sent: string[] = [];
  closed = false;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;

  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }

  open() {
    this.onopen?.();
  }
  receive(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  drop() {
    this.onclose?.();
  }
}

const roomJoined = (over: Record<string, unknown> = {}) => ({
  roomJoined: {
    roomCode: "ABCD",
    selfPlayerId: "p1",
    hostId: "p1",
    players: [{ id: "p1", displayName: "Ana" }],
    ...over,
  },
});

describe("Connection", () => {
  let sockets: FakeSocket[];
  let conn: Connection;

  beforeEach(() => {
    sockets = [];
    vi.useFakeTimers();
    conn = new Connection("ws://test/ws", {
      socketFactory: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
      backoff: { baseMs: 100, factor: 2, jitter: 0, random: () => 0.5 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("goes connecting -> open", () => {
    conn.start();
    expect(conn.getSnapshot().state).toBe("connecting");
    sockets[0].open();
    expect(conn.getSnapshot().state).toBe("open");
  });

  it("holds a create request until the socket is open, then sends it", () => {
    conn.start();
    conn.actions.createRoom("Ana", "fr");
    expect(sockets[0].sent).toEqual([]);
    sockets[0].open();
    expect(JSON.parse(sockets[0].sent[0])).toEqual({
      createRoom: { displayName: "Ana", locale: "fr" },
    });
  });

  it("keeps the roster in sync with server frames", () => {
    conn.start();
    sockets[0].open();
    conn.actions.createRoom("Ana", "en");
    sockets[0].receive(roomJoined());
    sockets[0].receive({ playerJoined: { player: { id: "p2", displayName: "Ben" } } });
    expect(conn.getSnapshot().room?.players.map((p) => p.displayName)).toEqual(["Ana", "Ben"]);

    sockets[0].receive({ playerLeft: { playerId: "p2" } });
    expect(conn.getSnapshot().room?.players.map((p) => p.displayName)).toEqual(["Ana"]);
  });

  it("tracks the host and updates it on hostChanged", () => {
    conn.start();
    sockets[0].open();
    conn.actions.createRoom("Ana", "en");
    sockets[0].receive(roomJoined({ hostId: "p1" }));
    expect(conn.getSnapshot().room?.hostId).toBe("p1");

    sockets[0].receive({ hostChanged: { hostId: "p2" } });
    expect(conn.getSnapshot().room?.hostId).toBe("p2");
  });

  it("records the last echo", () => {
    conn.start();
    sockets[0].open();
    conn.actions.createRoom("Ana", "en");
    sockets[0].receive(roomJoined());
    sockets[0].receive({ echoResult: { text: "marco", fromPlayerId: "p1" } });
    expect(conn.getSnapshot().lastEcho).toEqual({ text: "marco", fromPlayerId: "p1" });
  });

  it("reconnects after a drop and re-asserts the room with the same locale", () => {
    conn.start();
    sockets[0].open();
    conn.actions.joinRoom("ABCD", "Ana", "fr");
    sockets[0].receive(roomJoined());
    sockets[0].sent.length = 0;

    sockets[0].drop();
    expect(conn.getSnapshot().state).toBe("reconnecting");

    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(2);

    sockets[1].open();
    expect(JSON.parse(sockets[1].sent[0])).toEqual({
      joinRoom: { roomCode: "ABCD", displayName: "Ana", locale: "fr" },
    });
  });

  it("stop() closes for good and ignores later socket events", () => {
    conn.start();
    sockets[0].open();
    conn.stop();
    expect(conn.getSnapshot().state).toBe("closed");

    sockets[0].drop();
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
  });

  it("a failed rejoin (room_not_found) drops back to the join screen", () => {
    conn.start();
    sockets[0].open();
    conn.actions.joinRoom("ZZZZ", "Ana", "en");
    sockets[0].receive({ error: { code: "room_not_found", message: "nope" } });
    expect(conn.getSnapshot().room).toBeNull();
    expect(conn.getSnapshot().lastError).toBe("room_not_found");
  });

  // ─── games ────────────────────────────────────────────────────────────────

  it("gameStarted sets snapshot.game; gameEnded clears it", () => {
    conn.start();
    sockets[0].open();
    conn.actions.createRoom("Ana", "en");
    sockets[0].receive(roomJoined());

    sockets[0].receive({ gameStarted: { gameId: "imposter" } });
    expect(conn.getSnapshot().game).toEqual({ id: "imposter" });

    sockets[0].receive({ gameEnded: { gameId: "imposter", reason: "player_left" } });
    expect(conn.getSnapshot().game).toBeNull();
  });

  it("streams gameEvent payloads to subscribers", () => {
    conn.start();
    sockets[0].open();
    conn.actions.createRoom("Ana", "en");
    sockets[0].receive(roomJoined());
    sockets[0].receive({ gameStarted: { gameId: "imposter" } });

    const seen: string[] = [];
    conn.onGameEvent((p) => seen.push(p));
    sockets[0].receive({ gameEvent: { gameId: "imposter", payload: '{"revealProgress":{"total":3}}' } });

    expect(seen).toEqual(['{"revealProgress":{"total":3}}']);
  });

  it("replays buffered gameEvents to a subscriber that attaches late", () => {
    conn.start();
    sockets[0].open();
    conn.actions.createRoom("Ana", "en");
    sockets[0].receive(roomJoined());
    sockets[0].receive({ gameStarted: { gameId: "imposter" } });
    sockets[0].receive({ gameEvent: { gameId: "imposter", payload: '{"roleAssignment":{"isImposter":true}}' } });
    sockets[0].receive({ gameEvent: { gameId: "imposter", payload: '{"revealProgress":{"total":3}}' } });

    const seen: string[] = [];
    conn.onGameEvent((p) => seen.push(p)); // attaches after both events

    expect(seen).toEqual([
      '{"roleAssignment":{"isImposter":true}}',
      '{"revealProgress":{"total":3}}',
    ]);
  });

  it("gameAction sends an envelope only while a game is running", () => {
    conn.start();
    sockets[0].open();
    conn.actions.createRoom("Ana", "en");
    sockets[0].receive(roomJoined());
    sockets[0].sent.length = 0;

    conn.actions.gameAction("imposter", '{"markReady":{}}');
    expect(sockets[0].sent).toEqual([]); // no game yet

    sockets[0].receive({ gameStarted: { gameId: "imposter" } });
    conn.actions.gameAction("imposter", '{"markReady":{}}');
    expect(JSON.parse(sockets[0].sent[0])).toEqual({
      gameAction: { gameId: "imposter", payload: '{"markReady":{}}' },
    });
  });
});
