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
// A dropped socket does not cost a player their seat. The server holds it for a
// while, and the session token it gave us reclaims it from a new socket: same
// player id, same score, same place in the game. The token is kept in
// sessionStorage, so a reload gets back in too. Only when the server says the seat
// has gone does this fall back to joining again as a new player.

import { Backoff, type BackoffOptions } from "./backoff";
import {
  decodeServerMessage,
  encodeCreateRoom,
  encodeEcho,
  encodeGameAction,
  encodeJoinRoom,
  encodeKickPlayer,
  encodeLeaveRoom,
  encodeResumeRoom,
  encodeSetGameOptions,
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
  /** A main screen (a TV showing the game), not a person. It is on the roster
   * so the room can address it, but it never plays and never counts towards a
   * game's minimum. Optional so a plain { id, displayName } still fits. */
  screen?: boolean;
}

/** The host's live pending choice for the next game's start options (e.g.
 * Imposter's category), broadcast via GameOptionsChanged. `options` is that
 * game's own proto3-JSON, opaque here — only the game's own code decodes it. */
export interface PendingOptions {
  gameId: string;
  options: string;
}

export interface RoomState {
  code: string;
  selfId: string;
  hostId: string;
  players: Player[];
  /** Players who have left this room, most recent first. Kept because a round
   * survives a departure, so their name is still needed after they're off the
   * roster — a clue of theirs stays in the recap, and a vote tally can name
   * them. Capped at DEPARTED_LIMIT; past that, the oldest is forgotten and
   * their name falls back to "someone who left". */
  departed: Player[];
  /** Players still on the roster whose connection has dropped. The server is
   * holding their seat, so they may yet come back. */
  offline: string[];
  pendingOptions: PendingOptions | null;
}

export interface EchoLine {
  text: string;
  fromPlayerId: string;
}

/** Why a game stopped, as the server reported it: "finished" for a round that
 * ran its course, or a reason the game defined ("imposter_left"). Unknown
 * reasons are expected — a newer server can invent one — so the UI treats
 * anything it doesn't recognize as a plain "the round ended". */
export interface GameEnd {
  gameId: string;
  reason: string;
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
  /** The player who most recently left, for a "so-and-so left" notice. A fresh
   * object on every departure, even if the same player somehow left twice, so
   * a component can re-show its notice on identity alone. */
  lastDeparture: Player | null;
  /** Why the last game stopped, for a notice explaining the jump back to the
   * lobby. Cleared when a new game starts. */
  lastGameEnd: GameEnd | null;
}

/** The part of the browser's Storage this module uses, so tests can pass a fake. */
export type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface ConnectionOptions {
  socketFactory?: SocketFactory;
  backoff?: BackoffOptions;
  /** Where the seat's token is kept across a reload. Nothing is kept without one. */
  store?: SessionStore | null;
}

/** What the user has asked to be in. code === null means "create a new room"; a
 * string means "join this one", or reclaim a seat in it if token is set. */
interface Desired {
  code: string | null;
  displayName: string;
  locale: string;
  token?: string;
  /** Joining as a main screen rather than a player. */
  screen?: boolean;
}

/** A wire player as the snapshot holds it. `screen` is only set when true, so an
 * ordinary player stays the plain { id, displayName } every screen expects. */
function toPlayer(p: { id: string; displayName: string; screen: boolean }): Player {
  return p.screen ? { id: p.id, displayName: p.displayName, screen: true } : { id: p.id, displayName: p.displayName };
}

const SESSION_KEY = "pg.session.v1";

// Cap on buffered game events per game, so onGameEvent can replay what a
// just-mounted screen missed without growing without bound.
const GAME_EVENT_BUFFER = 500;

// How many departed players' names to remember. Generous enough that a long
// session's worth of dropped phones all stay nameable, bounded so a room
// nobody closes can't grow this forever.
const DEPARTED_LIMIT = 50;

export class Connection {
  readonly #url: string;
  readonly #newSocket: SocketFactory;
  readonly #backoff: Backoff;
  readonly #store: SessionStore | null;

  #ws: SocketLike | null = null;
  #stopped = false;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  #desired: Desired | null = null;
  /** The seat was given up while we were away, so the next RoomJoined is a new
   * player rather than the one the user was, and they should be told. */
  #seatLost = false;

  #snapshot: Snapshot = {
    state: "connecting",
    room: null,
    game: null,
    lastError: null,
    lastEcho: null,
    lastDeparture: null,
    lastGameEnd: null,
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
    this.#store = opts.store ?? null;
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
    this.#desired = this.#loadSession();
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

  /** The page is being put away (see useConnection). Closes the socket now rather
   * than leaving it open behind a page nobody can see: the browser's back/forward
   * cache can keep a socket alive and answering the server's heartbeat, which
   * would leave a phantom on the roster. The seat is held as for any other drop. */
  suspend(): void {
    if (this.#reconnectTimer !== null) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    const ws = this.#ws;
    this.#ws = null;
    ws?.close();
    if (!this.#stopped) this.#patch({ state: "reconnecting" });
  }

  /** The page is back, or the network is, so reconnect now rather than waiting out
   * a backoff timer that a sleeping phone may have stretched to minutes. A socket
   * already open or opening is left alone. */
  wake(): void {
    if (this.#stopped || this.#ws !== null) return;
    if (this.#reconnectTimer !== null) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    this.#backoff.reset();
    this.#connect();
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
      this.#reconnectTimer = setTimeout(() => {
        this.#reconnectTimer = null;
        this.#connect();
      }, delay);
    };

    ws.onerror = () => {
      if (this.#ws !== ws) return;
      this.#patch({ lastError: "socket_error" });
    };
  }

  // ─── actions ─────────────────────────────────────────────────────────────

  readonly actions = {
    createRoom: (displayName: string, locale: string, screen = false): void => {
      this.#desired = { code: null, displayName, locale, screen };
      this.#patch({ lastError: null });
      this.#assertDesired();
    },
    joinRoom: (code: string, displayName: string, locale: string, screen = false): void => {
      this.#desired = { code, displayName, locale, screen };
      this.#patch({ lastError: null });
      this.#assertDesired();
    },
    leaveRoom: (): void => {
      if (this.#isOpen()) this.#ws!.send(encodeLeaveRoom());
      this.#desired = null;
      this.#saveSession();
      this.#gameEventLog = [];
      this.#patch({ room: null, game: null, lastEcho: null });
    },
    echo: (text: string): void => {
      if (this.#isOpen() && this.#snapshot.room) this.#ws!.send(encodeEcho(text));
    },
    startGame: (gameId: string, options?: string): void => {
      if (this.#isOpen() && this.#snapshot.room) this.#ws!.send(encodeStartGame(gameId, options));
    },
    setGameOptions: (gameId: string, options: string): void => {
      if (this.#isOpen() && this.#snapshot.room) {
        this.#ws!.send(encodeSetGameOptions(gameId, options));
      }
    },
    /** Whether the connection is already in a room or trying to get into one,
     * including a seat saved from before a reload that it is about to reclaim.
     * A screen that opens a room by itself checks this first, so a reload
     * resumes the old room instead of opening a second one. */
    wantsRoom: (): boolean => this.#desired !== null,
    /** Host only: remove a player from the room. The server refuses anyone else. */
    kickPlayer: (playerId: string): void => {
      if (this.#isOpen() && this.#snapshot.room) this.#ws!.send(encodeKickPlayer(playerId));
    },
    gameAction: (gameId: string, payload: string): void => {
      if (this.#isOpen() && this.#snapshot.game) {
        this.#ws!.send(encodeGameAction(gameId, payload));
      }
    },
    /** Drop the last error. A screen showing a rejection ("that clue is the
     * secret word") calls this once the player starts fixing it, so the
     * warning does not outlive the mistake. */
    clearError: (): void => {
      if (this.#snapshot.lastError !== null) this.#patch({ lastError: null });
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
    if (d.code !== null && d.token) {
      this.#ws!.send(encodeResumeRoom(d.code, d.token));
      return;
    }
    this.#ws!.send(
      d.code === null
        ? encodeCreateRoom(d.displayName, d.locale, d.screen)
        : encodeJoinRoom(d.code, d.displayName, d.locale, d.screen),
    );
  }

  /** Keep the current seat where a reload can find it, or forget it. */
  #saveSession(): void {
    try {
      const d = this.#desired;
      if (d?.code && d.token) this.#store?.setItem(SESSION_KEY, JSON.stringify(d));
      else this.#store?.removeItem(SESSION_KEY);
    } catch {
      // Blocked storage only costs the seat on a reload. A dropped socket still
      // gets back in, because the token is also held in memory.
    }
  }

  /** The seat saved by an earlier page load, if there is one. A value that does not
   * look right is treated as nothing saved: the server decides whether it is valid. */
  #loadSession(): Desired | null {
    try {
      const raw = this.#store?.getItem(SESSION_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as Partial<Desired> | null;
      if (typeof d?.code !== "string" || typeof d.token !== "string") return null;
      return {
        code: d.code,
        token: d.token,
        displayName: typeof d.displayName === "string" ? d.displayName : "",
        locale: typeof d.locale === "string" ? d.locale : "en",
        screen: d.screen === true,
      };
    } catch {
      return null;
    }
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
        const { roomCode, selfPlayerId, hostId, players, sessionToken, resumed } = msg.payload.value;
        const { activeGameId, gameEvents, offlinePlayerIds } = msg.payload.value;
        if (this.#desired) {
          this.#desired = { ...this.#desired, code: roomCode, token: sessionToken || undefined };
          this.#saveSession();
        }

        // Back in the same room: anyone who left is still worth naming, because a
        // clue of theirs may still be on screen. Otherwise it is a new room.
        const before = this.#snapshot.room;
        const departed = resumed && before?.code === roomCode ? before.departed : [];
        const pendingOptions = resumed && before?.code === roomCode ? before.pendingOptions : null;

        // The server's replay is the whole story of this player's game so far, so
        // it replaces what we had rather than adding to it.
        this.#gameEventLog = [...gameEvents];
        const lastError = this.#seatLost ? "session_expired" : null;
        this.#seatLost = false;
        this.#patch({
          room: {
            code: roomCode,
            selfId: selfPlayerId,
            hostId,
            players: players.map(toPlayer),
            departed,
            offline: [...offlinePlayerIds],
            pendingOptions,
          },
          game: activeGameId ? { id: activeGameId } : null,
          lastError,
          // A fresh room, or a rejoin after a reconnect: nothing from the old
          // one should still be on screen as a notice.
          lastDeparture: null,
          lastGameEnd: null,
        });

        // A game screen still mounted from before the drop has to catch up too. It
        // folds from the start of the match, and each round's first event resets
        // the round's state, so going through them all again lands on the right
        // screen. A screen mounting after this gets them from onGameEvent instead.
        for (const payload of gameEvents) {
          for (const fn of this.#gameListeners) fn(payload);
        }
        break;
      }

      case "playerPresence": {
        const room = this.#snapshot.room;
        if (!room) break;
        const { playerId, connected } = msg.payload.value;
        const others = room.offline.filter((id) => id !== playerId);
        this.#patch({ room: { ...room, offline: connected ? others : [...others, playerId] } });
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
            players: [...this.#snapshot.room.players, toPlayer(p)],
          },
        });
        break;
      }

      case "playerLeft": {
        const id = msg.payload.value.playerId;
        const room = this.#snapshot.room;
        if (!room) break;
        // PlayerLeft carries only an id, so their name has to be taken off the
        // roster before they're removed from it — afterwards it's gone.
        const gone = room.players.find((x) => x.id === id);
        if (!gone) break; // already off the roster; nothing to report
        this.#patch({
          room: {
            ...room,
            players: room.players.filter((x) => x.id !== id),
            departed: [gone, ...room.departed].slice(0, DEPARTED_LIMIT),
            offline: room.offline.filter((x) => x !== id),
          },
          lastDeparture: { ...gone },
        });
        break;
      }

      case "echoResult": {
        const { text, fromPlayerId } = msg.payload.value;
        this.#patch({ lastEcho: { text, fromPlayerId } });
        break;
      }

      case "gameOptionsChanged": {
        if (!this.#snapshot.room) break;
        const { gameId, options } = msg.payload.value;
        this.#patch({ room: { ...this.#snapshot.room, pendingOptions: { gameId, options } } });
        break;
      }

      case "gameStarted": {
        this.#gameEventLog = [];
        // A new round starts clean: why the last one ended is no longer news.
        this.#patch({ game: { id: msg.payload.value.gameId }, lastGameEnd: null });
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
        const { gameId, reason } = msg.payload.value;
        this.#gameEventLog = [];
        // The reason is kept, not dropped: a round that ends because the
        // imposter quit sends everyone back to the lobby, and without this the
        // jump has no explanation on screen.
        this.#patch({ game: null, lastGameEnd: { gameId, reason } });
        break;
      }

      case "error": {
        const { code } = msg.payload.value;

        // The seat has gone but the room may not have, so try again as a new
        // player. Nothing is shown yet: a RoomJoined or room_not_found decides that.
        if (code === "session_expired") {
          if (this.#desired) this.#desired = { ...this.#desired, token: undefined };
          this.#saveSession();
          this.#seatLost = true;
          this.#gameEventLog = [];
          this.#patch({ game: null });
          this.#assertDesired();
          break;
        }

        // Another tab or device took this seat. Stand down rather than reconnect
        // and take it back, or the two would fight over it forever. The socket is
        // closed because the server still has it down as being in that room, and it
        // would refuse to let this tab join another one on it.
        if (code === "session_replaced") {
          this.#desired = null;
          this.#saveSession();
          this.#gameEventLog = [];
          this.#patch({ room: null, game: null, lastError: code, lastDeparture: null, lastGameEnd: null });
          this.#ws?.close();
          break;
        }

        // The host removed this player. The server has already taken them off
        // the roster; LeaveRoom tells this connection's side of the server it
        // is no longer in the room, so it may create or join another one.
        if (code === "kicked") {
          if (this.#isOpen()) this.#ws!.send(encodeLeaveRoom());
          this.#desired = null;
          this.#saveSession();
          this.#seatLost = false;
          this.#gameEventLog = [];
          this.#patch({ room: null, game: null, lastError: code, lastDeparture: null, lastGameEnd: null });
          break;
        }

        this.#patch({ lastError: code });
        if (code === "room_not_found") {
          this.#desired = null;
          this.#saveSession();
          this.#seatLost = false;
          // Out of the room entirely: notices about who left it, or why its
          // last round stopped, are no longer this player's business.
          this.#patch({ room: null, game: null, lastDeparture: null, lastGameEnd: null });
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
