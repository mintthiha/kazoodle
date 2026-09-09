// The connection to the session server. This is the ONLY module in the app that
// opens a socket or reads a frame; screens use the useConnection hook, never a
// WebSocket directly.
//
// Responsibilities:
//   - hold one socket, reconnect with backoff when it drops
//   - track "what the user wants" (create / join a room) and re-assert it after
//     a reconnect, so a dropped phone reappears in its room
//   - expose an immutable snapshot that React can subscribe to
//
// True session restore (same identity, same score) is a deliberately open
// design question. On reconnect the server issues a fresh player; this layer
// just gets the roster back in sync.

import { Backoff, type BackoffOptions } from "./backoff";
import {
  decodeServerMessage,
  encodeCreateRoom,
  encodeEcho,
  encodeJoinRoom,
  encodeLeaveRoom,
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
  players: Player[];
}

export interface EchoLine {
  text: string;
  fromPlayerId: string;
}

/** Immutable view of the connection. A new object is produced on every change,
 * so referential identity is a safe "did anything change?" check. */
export interface Snapshot {
  state: ConnState;
  room: RoomState | null;
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
}

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
    lastError: null,
    lastEcho: null,
  };
  readonly #listeners = new Set<() => void>();

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
      // A socket error is always followed by a close event; let onclose drive
      // the reconnect. Nothing to do here but note it.
      if (this.#ws !== ws) return;
      this.#patch({ lastError: "socket_error" });
    };
  }

  // ─── actions ─────────────────────────────────────────────────────────────

  readonly actions = {
    createRoom: (displayName: string): void => {
      this.#desired = { code: null, displayName };
      this.#patch({ lastError: null });
      this.#assertDesired();
    },
    joinRoom: (code: string, displayName: string): void => {
      this.#desired = { code, displayName };
      this.#patch({ lastError: null });
      this.#assertDesired();
    },
    leaveRoom: (): void => {
      if (this.#isOpen()) this.#ws!.send(encodeLeaveRoom());
      this.#desired = null;
      this.#patch({ room: null, lastEcho: null });
    },
    echo: (text: string): void => {
      if (this.#isOpen() && this.#snapshot.room) this.#ws!.send(encodeEcho(text));
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
    this.#ws!.send(d.code === null ? encodeCreateRoom(d.displayName) : encodeJoinRoom(d.code, d.displayName));
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
        const { roomCode, selfPlayerId, players } = msg.payload.value;
        // Remember the code so a later reconnect rejoins instead of creating.
        if (this.#desired) this.#desired = { ...this.#desired, code: roomCode };
        this.#patch({
          room: {
            code: roomCode,
            selfId: selfPlayerId,
            players: players.map((p) => ({ id: p.id, displayName: p.displayName })),
          },
          lastError: null,
        });
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

      case "error": {
        const { code } = msg.payload.value;
        this.#patch({ lastError: code });
        // A rejoin that failed (room gone while we were away) sends us back to
        // the join screen rather than leaving us stuck.
        if (code === "room_not_found") {
          this.#desired = null;
          this.#patch({ room: null });
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
      next.lastError === this.#snapshot.lastError &&
      next.lastEcho === this.#snapshot.lastEcho
    ) {
      return;
    }
    this.#snapshot = next;
    for (const fn of this.#listeners) fn();
  }
}
