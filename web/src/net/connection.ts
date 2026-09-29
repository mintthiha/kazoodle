// The connection to the session server. This is the ONLY module in the app that
// opens a socket or reads a frame; screens use the useConnection hook, never a
// WebSocket directly.
//
// Responsibilities:
//   - hold one socket, reconnect with backoff when it drops
//   - track "what the user wants" (create / join a room) and re-assert it after
//     a reconnect, so a dropped phone reappears in its room
//   - expose an immutable snapshot that React can subscribe to
//   - fan out game events to whichever screen is showing the running game
//
// True session restore (same identity, same score) is a deliberately open
// design question. On reconnect the server issues a fresh player; this layer
// just gets the roster back in sync. A game running at reconnect time is
// aborted server-side, so the client returns to the lobby.

import { Backoff, type BackoffOptions } from "./backoff";
import {
  decodeServerMessage,
  encodeCreateRoom,
  encodeEcho,
  encodeGameAction,
  encodeJoinRoom,
  encodeLeaveRoom,
  encodeStartGame,
} from "./messages";

/** The minimum of the WebSocket surface this module uses. Lets tests inject a
 * fake without a real network. The browser's WebSocket satisfies it. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export type ConnState = "connecting" | "open" | "reconnecting" | "closed";

export interface Player {
  id: string;
  displayName: string;
}

export interface RoomState {
  code: string;
  selfId: string;
  hostId: string;
  players: Player[];
}

export interface EchoLine {
  text: string;
  fromPlayerId: string;
}

/** Immutable view of the connection. A new object is produced on every change,
 * so referential identity is a safe "did anything change?" check. Game *events*
 * are not in here — they arrive through onGameEvent. */
export interface Snapshot {
  state: ConnState;
  room: RoomState | null;
  game: { id: string } | null;
  lastError: string | null;
  lastEcho: EchoLine | null;
}

export interface ConnectionOptions {
  socketFactory?: SocketFactory;
  backoff?: BackoffOptions;
}

/** What the user has asked to be in. code === null means "create a new room";
 * a string means "join / rejoin this one". */
interface Desired {
  code: string | null;
  displayName: string;
  locale: string;
}

// Cap on buffered game events per game, so onGameEvent can replay what a
// just-mounted screen missed without growing without bound.
const GAME_EVENT_BUFFER = 500;

export class Connection {
  readonly #url: string;
  readonly #newSocket: SocketFactory;
  readonly #backoff: Backoff;

  #ws: SocketLike | null = null;
  #stopped = false;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  #desired: Desired | null = null;

  #snapshot: Snapshot = {
    state: "connecting",
    room: null,
    game: null,
    lastError: null,
    lastEcho: null,
  };
  readonly #listeners = new Set<() => void>();

  // Game events are a stream, not snapshot state. #gameEventLog holds the
  // current game's events so a screen that mounts slightly late can catch up.
  readonly #gameListeners = new Set<(payload: string) => void>();
  #gameEventLog: string[] = [];

  constructor(url: string, opts: ConnectionOptions = {}) {
    this.#url = url;
    this.#newSocket = opts.socketFactory ?? ((u) => new WebSocket(u) as unknown as SocketLike);
    this.#backoff = new Backoff(opts.backoff);
  }

  // ─── React store interface (stable references) ────────────────────────────

  subscribe = (fn: () => void): (() => void) => {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  };

  getSnapshot = (): Snapshot => this.#snapshot;

  /** Subscribe to game events for the current game. The callback is first
   * replayed the events buffered so far, then called for each new one. */
  onGameEvent = (fn: (payload: string) => void): (() => void) => {
    for (const p of this.#gameEventLog) fn(p);
    this.#gameListeners.add(fn);
    return () => this.#gameListeners.delete(fn);
  };

  // ─── lifecycle ───────────────────────────────────────────────────────────

  /** Open the socket and keep it open (reconnecting on drops) until stop(). */
  start(): void {
    this.#stopped = false;
    this.#connect();
  }

  /** Close for good: no more reconnects. */
  stop(): void {
    this.#stopped = true;
    if (this.#reconnectTimer !== null) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    this.#ws?.close();
    this.#ws = null;
    this.#patch({ state: "closed" });
  }

  #connect(): void {
    if (this.#stopped) return;

    const ws = this.#newSocket(this.#url);
    this.#ws = ws;
    this.#patch({ state: this.#backoff.attempt === 0 ? "connecting" : "reconnecting" });

    // Every handler ignores events from a socket we have already replaced.
    ws.onopen = () => {
      if (this.#ws !== ws) return;
      this.#backoff.reset();
      this.#patch({ state: "open" });
      this.#assertDesired();
    };

    ws.onmessage = (ev) => {
      if (this.#ws !== ws) return;
      this.#handleFrame(String(ev.data));
    };

    ws.onclose = () => {
      if (this.#ws !== ws) return;
      this.#ws = null;
      if (this.#stopped) {
        this.#patch({ state: "closed" });
        return;
      }
      this.#patch({ state: "reconnecting" });
      const delay = this.#backoff.next();
      this.#reconnectTimer = setTimeout(() => this.#connect(), delay);
    };

    ws.onerror = () => {
      if (this.#ws !== ws) return;
      this.#patch({ lastError: "socket_error" });
    };
  }

  // ─── actions ─────────────────────────────────────────────────────────────

  readonly actions = {
    createRoom: (displayName: string, locale: string): void => {
      this.#desired = { code: null, displayName, locale };
      this.#patch({ lastError: null });
      this.#assertDesired();
    },
    joinRoom: (code: string, displayName: string, locale: string): void => {
      this.#desired = { code, displayName, locale };
      this.#patch({ lastError: null });
      this.#assertDesired();
    },
    leaveRoom: (): void => {
      if (this.#isOpen()) this.#ws!.send(encodeLeaveRoom());
      this.#desired = null;
      this.#gameEventLog = [];
      this.#patch({ room: null, game: null, lastEcho: null });
    },
    echo: (text: string): void => {
      if (this.#isOpen() && this.#snapshot.room) this.#ws!.send(encodeEcho(text));
    },
    startGame: (gameId: string, options?: string): void => {
      if (this.#isOpen() && this.#snapshot.room) this.#ws!.send(encodeStartGame(gameId, options));
    },
    gameAction: (gameId: string, payload: string): void => {
      if (this.#isOpen() && this.#snapshot.game) {
        this.#ws!.send(encodeGameAction(gameId, payload));
      }
    },
  };

  // ─── internals ───────────────────────────────────────────────────────────

  #isOpen(): boolean {
    return this.#ws !== null && this.#snapshot.state === "open";
  }

  /** (Re)send whatever the user is trying to be in. Safe to call any time: it
   * does nothing until the socket is open. */
  #assertDesired(): void {
    if (!this.#isOpen() || this.#desired === null) return;
    const d = this.#desired;
    this.#ws!.send(
      d.code === null
        ? encodeCreateRoom(d.displayName, d.locale)
        : encodeJoinRoom(d.code, d.displayName, d.locale),
    );
  }

  #handleFrame(raw: string): void {
    let msg: ReturnType<typeof decodeServerMessage>;
    try {
      msg = decodeServerMessage(raw);
    } catch {
      this.#patch({ lastError: "bad_frame" });
      return;
    }

    switch (msg.payload.case) {
      case "roomJoined": {
        const { roomCode, selfPlayerId, hostId, players } = msg.payload.value;
        if (this.#desired) this.#desired = { ...this.#desired, code: roomCode };
        this.#gameEventLog = [];
        this.#patch({
          room: {
            code: roomCode,
            selfId: selfPlayerId,
            hostId,
            players: players.map((p) => ({ id: p.id, displayName: p.displayName })),
          },
          game: null,
          lastError: null,
        });
        break;
      }

      case "hostChanged": {
        if (!this.#snapshot.room) break;
        this.#patch({ room: { ...this.#snapshot.room, hostId: msg.payload.value.hostId } });
        break;
      }

      case "playerJoined": {
        const p = msg.payload.value.player;
        if (!p || !this.#snapshot.room) break;
        if (this.#snapshot.room.players.some((x) => x.id === p.id)) break;
        this.#patch({
          room: {
            ...this.#snapshot.room,
            players: [...this.#snapshot.room.players, { id: p.id, displayName: p.displayName }],
          },
        });
        break;
      }

      case "playerLeft": {
        const id = msg.payload.value.playerId;
        if (!this.#snapshot.room) break;
        this.#patch({
          room: {
            ...this.#snapshot.room,
            players: this.#snapshot.room.players.filter((x) => x.id !== id),
          },
        });
        break;
      }

      case "echoResult": {
        const { text, fromPlayerId } = msg.payload.value;
        this.#patch({ lastEcho: { text, fromPlayerId } });
        break;
      }

      case "gameStarted": {
        this.#gameEventLog = [];
        this.#patch({ game: { id: msg.payload.value.gameId } });
        break;
      }

      case "gameEvent": {
        const { payload } = msg.payload.value;
        this.#gameEventLog.push(payload);
        if (this.#gameEventLog.length > GAME_EVENT_BUFFER) this.#gameEventLog.shift();
        for (const fn of this.#gameListeners) fn(payload);
        break;
      }

      case "gameEnded": {
        this.#gameEventLog = [];
        this.#patch({ game: null });
        break;
      }

      case "error": {
        const { code } = msg.payload.value;
        this.#patch({ lastError: code });
        if (code === "room_not_found") {
          this.#desired = null;
          this.#patch({ room: null, game: null });
        }
        break;
      }
    }
  }

  /** Replace #snapshot with a new object carrying the given changes, then wake
   * subscribers. Skips the notify if nothing actually changed. */
  #patch(changes: Partial<Snapshot>): void {
    const next: Snapshot = { ...this.#snapshot, ...changes };
    if (
      next.state === this.#snapshot.state &&
      next.room === this.#snapshot.room &&
      next.game === this.#snapshot.game &&
      next.lastError === this.#snapshot.lastError &&
      next.lastEcho === this.#snapshot.lastEcho
    ) {
      return;
    }
    this.#snapshot = next;
    for (const fn of this.#listeners) fn();
  }
}
