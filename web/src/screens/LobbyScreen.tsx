import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { displayNameOf } from "../displayName";
import { errorKey } from "../errorKey";
import { Avatar } from "../players/Avatar";
import { makeHueFor } from "../players/hues";
import { ChatPanel } from "./ChatPanel";
import { RulesCard } from "./RulesCard";
import { TwoTapButton } from "./TwoTapButton";
import type { RoomState } from "../net/connection";
import type { EchoLine } from "../net/connection";
import type { OnlineGame } from "../games/registry";
import "./lobby.css";

type CopyState = "idle" | "copied" | "failed";

interface Props {
  room: RoomState;
  /** Which game this room is for, and how that game sets up a match. */
  gameId: string;
  game: OnlineGame;
  /** Mirrors the server's minimum for this game. If they drift the server still
   * refuses the start; this only gates the button. */
  minPlayers: number;
  lastEcho: EchoLine | null;
  /** The last server error code, or null. Shown above the Start button: a
   * refusal the player cannot see is how a button comes to look broken. */
  lastError: string | null;
  isHost: boolean;
  /** Both take the game's options as proto3-JSON. */
  onStartGame: (options: string) => void;
  onSetOptions: (options: string) => void;
  onEcho: (text: string) => void;
  onLeave: () => void;
  /** Host only: remove a player from the room. */
  onKick: (playerId: string) => void;
}

// Second screen: the room's code, who is in it, the match setup and start
// control, and the chat. The setup panel belongs to the game (game.Setup); the
// lobby only holds the options it produces, as an opaque string.
//
// The host's picks are live choices, not just start-time ones: every change
// calls onSetOptions, which the app wires to SetGameOptions, so the whole
// lobby — not just the host — sees "Category: Food" update as the host changes
// their mind. See room.pendingOptions in net/connection.ts.
export function LobbyScreen({
  room,
  gameId,
  game,
  minPlayers,
  lastEcho,
  lastError,
  isHost,
  onStartGame,
  onSetOptions,
  onEcho,
  onLeave,
  onKick,
}: Props) {
  const { t } = useT();
  const [opts, setOpts] = useState(game.defaultOptions);
  // Result of the last "copy code" press. `n` increments on every press so
  // pressing twice restarts the confirmation timer even when the outcome is
  // the same both times (React skips a re-render if the value is unchanged).
  const [copy, setCopy] = useState<{ state: CopyState; n: number }>({ state: "idle", n: 0 });
  // Only connected players get dealt in, so a held seat does not count towards
  // starting. Otherwise the button could promise a game the server will refuse.
  // A main screen is on the roster but never plays, so it is left out of every
  // count and drawn apart from the players.
  const people = room.players.filter((p) => !p.screen);
  const screens = room.players.filter((p) => p.screen);
  const onlineCount = people.filter((p) => !room.offline.includes(p.id)).length;
  const maxPlayers = game.maxPlayers ?? Infinity;
  const canStart = onlineCount >= minPlayers && onlineCount <= maxPlayers;
  const hueFor = makeHueFor(people, room.departed);
  const openSeats = Math.max(0, minPlayers - people.length);
  const { Setup } = game;

  // Clear the copy confirmation a couple of seconds after it appears. The
  // returned function is the cleanup: React runs it before the next effect and
  // on unmount, so leaving the lobby mid-countdown cannot fire setCopy on a
  // screen that is gone.
  useEffect(() => {
    if (copy.state === "idle") return;
    const timer = setTimeout(() => setCopy({ state: "idle", n: copy.n }), 2000);
    return () => clearTimeout(timer);
  }, [copy.state, copy.n]);

  // Non-host players read the live pick back out of the room's broadcast
  // pendingOptions. Until the host touches anything nothing has been broadcast,
  // and what will be played is exactly the defaults, so that is what they see.
  const pending =
    room.pendingOptions && room.pendingOptions.gameId === gameId
      ? room.pendingOptions.options
      : game.defaultOptions;

  const host = room.players.find((p) => p.id === room.hostId);
  const hostName = host?.screen ? t("lobby.screen") : host ? displayNameOf(host.displayName, t) : t("lobby.host");

  // The host's pick is kept here and broadcast whole, since SetGameOptions
  // carries the options as one payload rather than a patch.
  function pick(next: string) {
    setOpts(next);
    onSetOptions(next);
  }

  async function copyCode() {
    try {
      // navigator.clipboard only exists in a secure context, and a phone
      // reaching the dev server over plain http on the LAN is not one — so a
      // missing clipboard is a normal case here, not an edge case.
      await navigator.clipboard.writeText(room.code);
      setCopy((c) => ({ state: "copied", n: c.n + 1 }));
    } catch {
      setCopy((c) => ({ state: "failed", n: c.n + 1 }));
    }
  }

  return (
    <main className="screen lobby">
      <header className="lobby-head">
        <h1>{t("lobby.heading")}</h1>
        <button className="danger" onClick={onLeave}>
          {t("lobby.leaveButton")}
        </button>
      </header>

      <div className="lobby-grid">
        <div className="lobby-col">
          {/* The code is what gets read aloud across a room, so it is the
              biggest thing on the screen. */}
          <section className="room-code">
            <div className="room-code-row">
              <div>
                <span className="room-code-label">{t("lobby.roomCode")}</span>
                <span className="room-code-value">{room.code}</span>
              </div>
              <button className="secondary copy-code" onClick={copyCode}>
                {copy.state === "copied" ? t("lobby.codeCopied") : t("lobby.copyCode")}
              </button>
            </div>
            {/* aria-live so a screen reader announces the result of a press. */}
            <p className="copy-status" aria-live="polite">
              {copy.state === "failed" && t("lobby.copyFailed")}
            </p>
          </section>

          <section>
            <h2>
              {t("lobby.players")} <span className="num">({people.length})</span>
            </h2>
            <ul className="roster">
              {people.map((p) => {
                const name = displayNameOf(p.displayName, t);
                return (
                  <li key={p.id} className="roster-row">
                    <Avatar name={name} hue={hueFor(p.id)} />
                    <span className="roster-name">
                      {name}
                      {p.id === room.selfId && <span className="you"> ({t("lobby.you")})</span>}
                    </span>
                    {room.offline.includes(p.id) && (
                      <span className="pill pill-offline">{t("lobby.offline")}</span>
                    )}
                    {p.id === room.hostId && <span className="pill">{t("lobby.host")}</span>}
                    {isHost && p.id !== room.selfId && (
                      <TwoTapButton
                        label={t("lobby.remove")}
                        confirmLabel={t("lobby.removeConfirm")}
                        onConfirm={() => onKick(p.id)}
                      />
                    )}
                  </li>
                );
              })}
              {screens.map((s) => (
                <li key={s.id} className="roster-row roster-screen">
                  <span className="avatar-empty" aria-hidden="true" />
                  <span className="roster-name">{t("lobby.screen")}</span>
                  {room.offline.includes(s.id) && <span className="pill pill-offline">{t("lobby.offline")}</span>}
                  {s.id === room.hostId && <span className="pill">{t("lobby.host")}</span>}
                </li>
              ))}
              {/* Seats still to fill before a game can start, drawn empty so a
                  disabled Start button has a visible reason. */}
              {Array.from({ length: openSeats }, (_, i) => (
                <li key={i} className="roster-row roster-seat">
                  <span className="avatar-empty" aria-hidden="true" />
                  <span>{t("lobby.emptySeat")}</span>
                </li>
              ))}
            </ul>
          </section>

          <RulesCard rules={game.rules(isHost ? opts : pending)} />
        </div>

        <div className="lobby-col">
          <section className="setup">
            <h2>{t("lobby.setupHeading")}</h2>
            {isHost ? (
              <Setup value={opts} onChange={pick} onlineCount={onlineCount} />
            ) : (
              <Setup value={pending} onlineCount={onlineCount} />
            )}
          </section>

          <ChatPanel room={room} lastEcho={lastEcho} onSend={onEcho} />
        </div>
      </div>

      <div className="dock lobby-dock">
        {errorKey(lastError) && <p className="hint">{t(errorKey(lastError)!)}</p>}
        {isHost ? (
          <>
            {onlineCount < minPlayers && (
              <p className="status">{t("lobby.needPlayers", { min: minPlayers })}</p>
            )}
            {onlineCount > maxPlayers && <p className="hint">{t("lobby.tooManyPlayers", { max: maxPlayers })}</p>}
            <button className="primary" onClick={() => onStartGame(opts)} disabled={!canStart}>
              {t(game.startKey)}
            </button>
          </>
        ) : (
          <p className="status">
            {t("lobby.waitingForHost", { who: hostName })}
          </p>
        )}
      </div>
    </main>
  );
}
