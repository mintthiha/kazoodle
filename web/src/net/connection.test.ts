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

  describe("keeping a seat through a drop", () => {
    const seated = (over: Record<string, unknown> = {}) =>
      roomJoined({ sessionToken: "secret", ...over });

    /** Joins, then drops the socket and opens the replacement. */
    function dropAndReconnect() {
      conn.start();
      sockets[0].open();
      conn.actions.joinRoom("ABCD", "Ana", "fr");
      sockets[0].receive(seated());
      sockets[0].drop();
      vi.advanceTimersByTime(100);
      sockets[1].open();
    }

    it("reclaims the seat with its token instead of joining again", () => {
      dropAndReconnect();
      expect(JSON.parse(sockets[1].sent[0])).toEqual({
        resumeRoom: { roomCode: "ABCD", sessionToken: "secret" },
      });
    });

    it("goes straight back into the running game, replaying its events", () => {
      dropAndReconnect();
      sockets[1].receive(seated({ resumed: true, activeGameId: "imposter", gameEvents: ["one", "two"] }));

      expect(conn.getSnapshot().game).toEqual({ id: "imposter" });
      const seen: string[] = [];
      conn.onGameEvent((p) => seen.push(p));
      expect(seen).toEqual(["one", "two"]);
    });

    it("catches up a game screen that stayed mounted through the drop", () => {
      const seen: string[] = [];
      conn.onGameEvent((p) => seen.push(p));
      dropAndReconnect();
      sockets[1].receive(seated({ resumed: true, activeGameId: "imposter", gameEvents: ["one"] }));
      expect(seen).toEqual(["one"]);
    });

    it("replaces the old event log rather than adding to it", () => {
      conn.start();
      sockets[0].open();
      conn.actions.joinRoom("ABCD", "Ana", "fr");
      sockets[0].receive(seated());
      sockets[0].receive({ gameStarted: { gameId: "imposter" } });
      sockets[0].receive({ gameEvent: { gameId: "imposter", payload: "one" } });
      sockets[0].drop();
      vi.advanceTimersByTime(100);
      sockets[1].open();
      sockets[1].receive(seated({ resumed: true, activeGameId: "imposter", gameEvents: ["one", "two"] }));

      const seen: string[] = [];
      conn.onGameEvent((p) => seen.push(p));
      expect(seen).toEqual(["one", "two"]);
    });

    it("keeps the names of players who left, for clues still on screen", () => {
      conn.start();
      sockets[0].open();
      conn.actions.joinRoom("ABCD", "Ana", "fr");
      sockets[0].receive(seated({ players: [{ id: "p1", displayName: "Ana" }, { id: "p2", displayName: "Ben" }] }));
      sockets[0].receive({ playerLeft: { playerId: "p2" } });
      sockets[0].drop();
      vi.advanceTimersByTime(100);
      sockets[1].open();
      sockets[1].receive(seated({ resumed: true }));

      expect(conn.getSnapshot().room?.departed.map((p) => p.displayName)).toEqual(["Ben"]);
    });

    it("joins as a new player when the seat has gone, and says so", () => {
      dropAndReconnect();
      sockets[1].receive({ error: { code: "session_expired", message: "gone" } });

      expect(JSON.parse(sockets[1].sent[1])).toEqual({
        joinRoom: { roomCode: "ABCD", displayName: "Ana", locale: "fr" },
      });

      sockets[1].receive(roomJoined({ selfPlayerId: "p9", sessionToken: "new" }));
      expect(conn.getSnapshot().room?.selfId).toBe("p9");
      expect(conn.getSnapshot().lastError).toBe("session_expired");
    });

    it("stands down when another tab takes the seat", () => {
      conn.start();
      sockets[0].open();
      conn.actions.joinRoom("ABCD", "Ana", "fr");
      sockets[0].receive(seated());

      sockets[0].receive({ error: { code: "session_replaced", message: "elsewhere" } });

      expect(conn.getSnapshot().room).toBeNull();
      expect(conn.getSnapshot().lastError).toBe("session_replaced");
      expect(sockets[0].closed).toBe(true);

      // It reconnects so it can be used again, but asks for nothing.
      sockets[0].drop();
      vi.advanceTimersByTime(100);
      sockets[1].open();
      expect(sockets[1].sent).toEqual([]);
    });

    it("tracks who is offline, and forgets them once they leave", () => {
      conn.start();
      sockets[0].open();
      conn.actions.joinRoom("ABCD", "Ana", "fr");
      sockets[0].receive(seated({
        players: [{ id: "p1", displayName: "Ana" }, { id: "p2", displayName: "Ben" }],
        offlinePlayerIds: ["p2"],
      }));
      expect(conn.getSnapshot().room?.offline).toEqual(["p2"]);

      sockets[0].receive({ playerPresence: { playerId: "p2", connected: true } });
      expect(conn.getSnapshot().room?.offline).toEqual([]);

      sockets[0].receive({ playerPresence: { playerId: "p2" } });
      expect(conn.getSnapshot().room?.offline).toEqual(["p2"]);

      sockets[0].receive({ playerLeft: { playerId: "p2" } });
      expect(conn.getSnapshot().room?.offline).toEqual([]);
    });

    it("suspend closes the socket, and wake reconnects at once and reclaims the seat", () => {
      conn.start();
      sockets[0].open();
      conn.actions.joinRoom("ABCD", "Ana", "fr");
      sockets[0].receive(seated());

      conn.suspend();
      expect(sockets[0].closed).toBe(true);
      expect(conn.getSnapshot().state).toBe("reconnecting");
      vi.advanceTimersByTime(60_000);
      expect(sockets).toHaveLength(1);

      conn.wake();
      expect(sockets).toHaveLength(2);
      sockets[1].open();
      expect(JSON.parse(sockets[1].sent[0])).toEqual({
        resumeRoom: { roomCode: "ABCD", sessionToken: "secret" },
      });
    });

    it("wake skips the wait for a backoff timer, and does not open a second socket", () => {
      conn.start();
      sockets[0].open();
      conn.wake();
      expect(sockets).toHaveLength(1);

      sockets[0].drop();
      conn.wake();
      expect(sockets).toHaveLength(2);
      vi.advanceTimersByTime(60_000);
      expect(sockets).toHaveLength(2);
    });
  });

  describe("across a reload", () => {
    function fakeStore() {
      const data = new Map<string, string>();
      return {
        data,
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      };
    }
    const withStore = (store: ReturnType<typeof fakeStore>) =>
      new Connection("ws://test/ws", {
        store,
        socketFactory: () => {
          const s = new FakeSocket();
          sockets.push(s);
          return s;
        },
        backoff: { baseMs: 100, factor: 2, jitter: 0, random: () => 0.5 },
      });
    const seat = roomJoined({ sessionToken: "secret" });

    it("a new page load reclaims the seat the last one saved", () => {
      const store = fakeStore();
      const before = withStore(store);
      before.start();
      sockets[0].open();
      before.actions.joinRoom("ABCD", "Ana", "fr");
      sockets[0].receive(seat);

      const after = withStore(store);
      after.start();
      sockets[1].open();
      expect(JSON.parse(sockets[1].sent[0])).toEqual({
        resumeRoom: { roomCode: "ABCD", sessionToken: "secret" },
      });
    });

    it("a main screen whose seat has gone rejoins as a main screen", () => {
      const store = fakeStore();
      const before = withStore(store);
      before.start();
      sockets[0].open();
      before.actions.createRoom("", "en", true);
      sockets[0].receive(seat);

      const after = withStore(store);
      after.start();
      sockets[1].open();
      sockets[1].receive({ error: { code: "session_expired", message: "gone" } });
      expect(JSON.parse(sockets[1].sent[1])).toEqual({
        joinRoom: { roomCode: "ABCD", locale: "en", screen: true },
      });
    });

    it("falls back to the saved name when that seat has gone", () => {
      const store = fakeStore();
      const before = withStore(store);
      before.start();
      sockets[0].open();
      before.actions.joinRoom("ABCD", "Ana", "fr");
      sockets[0].receive(seat);

      const after = withStore(store);
      after.start();
      sockets[1].open();
      sockets[1].receive({ error: { code: "session_expired", message: "gone" } });
      expect(JSON.parse(sockets[1].sent[1])).toEqual({
        joinRoom: { roomCode: "ABCD", displayName: "Ana", locale: "fr" },
      });
    });

    const forgets: { name: string; act: (c: Connection) => void }[] = [
      { name: "leaving the room", act: (c) => c.actions.leaveRoom() },
      { name: "the room being gone", act: () => sockets[0].receive({ error: { code: "room_not_found" } }) },
      { name: "another tab taking the seat", act: () => sockets[0].receive({ error: { code: "session_replaced" } }) },
      { name: "being removed by the host", act: () => sockets[0].receive({ error: { code: "kicked" } }) },
    ];
    for (const tt of forgets) {
      it(`${tt.name} forgets the seat`, () => {
        const store = fakeStore();
        const c = withStore(store);
        c.start();
        sockets[0].open();
        c.actions.joinRoom("ABCD", "Ana", "fr");
        sockets[0].receive(seat);
        expect(store.data.size).toBe(1);

        tt.act(c);
        expect(store.data.size).toBe(0);
      });
    }

    const junk = ["not json", "null", '{"code":"ABCD"}', '{"code":1,"token":"x"}'];
    for (const raw of junk) {
      it(`ignores a saved value of ${raw}`, () => {
        const store = fakeStore();
        store.data.set("pg.session.v1", raw);
        const c = withStore(store);
        c.start();
        sockets[0].open();
        expect(sockets[0].sent).toEqual([]);
      });
    }

    it("still keeps the seat through a drop when storage throws", () => {
      const c = withStore({
        ...fakeStore(),
        setItem: () => {
          throw new Error("blocked");
        },
      });
      c.start();
      sockets[0].open();
      c.actions.joinRoom("ABCD", "Ana", "fr");
      sockets[0].receive(seat);
      sockets[0].drop();
      vi.advanceTimersByTime(100);
      sockets[1].open();
      expect(JSON.parse(sockets[1].sent[0]).resumeRoom.sessionToken).toBe("secret");
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

  it("keeps why the last game ended, and clears it when the next one starts", () => {
    // Without the reason there is nothing to put on screen to explain an
    // abandoned round, and players just get dropped into the lobby.
    conn.start();
    sockets[0].open();
    conn.actions.createRoom("Ana", "en");
    sockets[0].receive(roomJoined());
    sockets[0].receive({ gameStarted: { gameId: "imposter" } });

    sockets[0].receive({ gameEnded: { gameId: "imposter", reason: "imposter_left" } });
    expect(conn.getSnapshot().lastGameEnd).toEqual({ gameId: "imposter", reason: "imposter_left" });

    sockets[0].receive({ gameStarted: { gameId: "imposter" } });
    expect(conn.getSnapshot().lastGameEnd).toBeNull();
  });

  // ─── departures ───────────────────────────────────────────────────────────

  it("remembers a departed player's name instead of only dropping them", () => {
    // A round survives a departure, so their clue stays in the recap and the
    // vote tally can still name them. PlayerLeft carries only an id, so the
    // name has to be captured off the roster on the way out.
    conn.start();
    sockets[0].open();
    conn.actions.createRoom("Ana", "en");
    sockets[0].receive(
      roomJoined({
        players: [
          { id: "p1", displayName: "Ana" },
          { id: "p2", displayName: "Ben" },
        ],
      }),
    );

    sockets[0].receive({ playerLeft: { playerId: "p2" } });

    const room = conn.getSnapshot().room;
    expect(room?.players.map((p) => p.id)).toEqual(["p1"]);
    expect(room?.departed).toEqual([{ id: "p2", displayName: "Ben" }]);
    expect(conn.getSnapshot().lastDeparture).toEqual({ id: "p2", displayName: "Ben" });
  });

  it("ignores a playerLeft for someone already off the roster", () => {
    conn.start();
    sockets[0].open();
    conn.actions.createRoom("Ana", "en");
    sockets[0].receive(roomJoined());

    sockets[0].receive({ playerLeft: { playerId: "p-never-here" } });

    expect(conn.getSnapshot().room?.departed).toEqual([]);
    expect(conn.getSnapshot().lastDeparture).toBeNull();
  });

  it("gives each departure a fresh object, so a repeat notice re-shows", () => {
    // The notice is transient and keyed on identity: two departures in a row
    // have to be two distinct values, or the second never re-renders.
    conn.start();
    sockets[0].open();
    conn.actions.createRoom("Ana", "en");
    sockets[0].receive(
      roomJoined({
        players: [
          { id: "p1", displayName: "Ana" },
          { id: "p2", displayName: "Ben" },
          { id: "p3", displayName: "Cal" },
        ],
      }),
    );

    sockets[0].receive({ playerLeft: { playerId: "p2" } });
    const first = conn.getSnapshot().lastDeparture;
    sockets[0].receive({ playerLeft: { playerId: "p3" } });
    const second = conn.getSnapshot().lastDeparture;

    expect(first).not.toBe(second);
    expect(second).toEqual({ id: "p3", displayName: "Cal" });
    // Most recent first.
    expect(conn.getSnapshot().room?.departed.map((p) => p.id)).toEqual(["p3", "p2"]);
  });

  it("starts a joined room with no departures and no stale notices", () => {
    conn.start();
    sockets[0].open();
    conn.actions.createRoom("Ana", "en");
    sockets[0].receive(
      roomJoined({
        players: [
          { id: "p1", displayName: "Ana" },
          { id: "p2", displayName: "Ben" },
        ],
      }),
    );
    sockets[0].receive({ playerLeft: { playerId: "p2" } });
    expect(conn.getSnapshot().lastDeparture).not.toBeNull();

    // A rejoin after a reconnect must not carry the old room's notices over.
    sockets[0].receive(roomJoined());
    expect(conn.getSnapshot().room?.departed).toEqual([]);
    expect(conn.getSnapshot().lastDeparture).toBeNull();
    expect(conn.getSnapshot().lastGameEnd).toBeNull();
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

describe("Connection: main screens and removal", () => {
  let sockets: FakeSocket[];
  let conn: Connection;

  beforeEach(() => {
    sockets = [];
    conn = new Connection("ws://test/ws", {
      socketFactory: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
    });
    conn.start();
    sockets[0].open();
  });

  it("creates a room as a main screen", () => {
    conn.actions.createRoom("", "fr", true);
    expect(JSON.parse(sockets[0].sent[0])).toEqual({ createRoom: { locale: "fr", screen: true } });
  });

  it("marks a main screen on the roster and leaves players plain", () => {
    conn.actions.joinRoom("ABCD", "Ana", "en");
    sockets[0].receive(
      roomJoined({
        selfPlayerId: "p2",
        players: [
          { id: "tv", displayName: "", screen: true },
          { id: "p2", displayName: "Ana" },
        ],
      }),
    );
    sockets[0].receive({ playerJoined: { player: { id: "p3", displayName: "Ben" } } });
    expect(conn.getSnapshot().room?.players).toEqual([
      { id: "tv", displayName: "", screen: true },
      { id: "p2", displayName: "Ana" },
      { id: "p3", displayName: "Ben" },
    ]);
  });

  it("sends a kick only from inside a room", () => {
    conn.actions.kickPlayer("p2");
    expect(sockets[0].sent).toEqual([]);

    conn.actions.createRoom("Ana", "en");
    sockets[0].receive(roomJoined());
    sockets[0].sent.length = 0;
    conn.actions.kickPlayer("p2");
    expect(JSON.parse(sockets[0].sent[0])).toEqual({ kickPlayer: { playerId: "p2" } });
  });

  it("a removed player leaves the room and says why", () => {
    conn.actions.joinRoom("ABCD", "Ana", "en");
    sockets[0].receive(roomJoined());
    sockets[0].receive({ gameStarted: { gameId: "fibblash" } });
    sockets[0].sent.length = 0;

    sockets[0].receive({ error: { code: "kicked" } });
    const snap = conn.getSnapshot();
    expect(snap.room).toBeNull();
    expect(snap.game).toBeNull();
    expect(snap.lastError).toBe("kicked");
    // LeaveRoom frees this socket to join another room.
    expect(JSON.parse(sockets[0].sent[0])).toEqual({ leaveRoom: {} });
  });
});
