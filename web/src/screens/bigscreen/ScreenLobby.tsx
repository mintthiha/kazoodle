import { useState } from "react";
import { useT } from "../../i18n";
import { displayNameOf } from "../../displayName";
import { errorKey } from "../../errorKey";
import type { GameListing, OnlineGame } from "../../games/registry";
import type { RoomState } from "../../net/connection";
import { Avatar } from "../../players/Avatar";
import { makeHueFor } from "../../players/hues";
import { RulesCard } from "../RulesCard";
import { TwoTapButton } from "../TwoTapButton";

interface Props {
  room: RoomState;
  gameId: string;
  game: OnlineGame;
  listing: Pick<GameListing, "nameKey" | "minPlayers">;
  lastError: string | null;
  onStart: (options: string) => void;
  onSetOptions: (options: string) => void;
  onKick: (playerId: string) => void;
  onLeave: () => void;
}

// The lobby as the main screen shows it: the code as big as the screen allows,
// where to type it, and who has joined so far. Read from across a room, so
// everything is large and there is nothing to scroll.
//
// The screen is usually the host, so the match setup and the start button are
// here; if a phone has taken the host role (the screen dropped for a while),
// the screen just shows the room.
export function ScreenLobby({ room, gameId, game, listing, lastError, onStart, onSetOptions, onKick, onLeave }: Props) {
  const { t } = useT();
  const [opts, setOpts] = useState(game.defaultOptions);
  const isHost = room.hostId === room.selfId;

  const people = room.players.filter((p) => !p.screen);
  const online = people.filter((p) => !room.offline.includes(p.id)).length;
  const max = game.maxPlayers ?? Infinity;
  const min = listing.minPlayers;
  const canStart = online >= min && online <= max;
  const hueFor = makeHueFor(people, room.departed);
  const pending =
    room.pendingOptions && room.pendingOptions.gameId === gameId ? room.pendingOptions.options : game.defaultOptions;
  const err = errorKey(lastError);
  const { Setup } = game;

  // The address a phone types. The host part only, plus the game's page: a
  // phone on the same network reaches the same server the screen did.
  const joinUrl = `${window.location.host}/${gameId}`;

  function pick(next: string) {
    setOpts(next);
    onSetOptions(next);
  }

  return (
    <main className="screen big-lobby">
      <header className="big-head">
        <h1 className="big-brand">{t(listing.nameKey)}</h1>
        <button className="danger" onClick={onLeave}>
          {t("screen.leave")}
        </button>
      </header>

      <div className="big-grid">
        <section className="big-join">
          <p className="big-join-line">{t("screen.joinAt")}</p>
          <p className="big-url">{joinUrl}</p>
          <p className="big-join-line">{t("screen.enterCode")}</p>
          <p className="big-code" aria-label={t("lobby.roomCode")}>
            {room.code}
          </p>
        </section>

        <section className="big-side">
          <h2>
            {t("lobby.players")} <span className="num">({people.length})</span>
          </h2>
          {people.length === 0 && <p className="status">{t("screen.waiting")}</p>}
          <ul className="roster big-roster">
            {people.map((p) => {
              const name = displayNameOf(p.displayName, t);
              return (
                <li key={p.id} className="roster-row">
                  <Avatar name={name} hue={hueFor(p.id)} />
                  <span className="roster-name">{name}</span>
                  {room.offline.includes(p.id) && <span className="pill pill-offline">{t("lobby.offline")}</span>}
                  {p.id === room.hostId && <span className="pill">{t("lobby.host")}</span>}
                  {isHost && (
                    <TwoTapButton
                      label={t("lobby.remove")}
                      confirmLabel={t("lobby.removeConfirm")}
                      onConfirm={() => onKick(p.id)}
                    />
                  )}
                </li>
              );
            })}
          </ul>

          <section className="setup">
            <h2>{t("lobby.setupHeading")}</h2>
            {isHost ? (
              <Setup value={opts} onChange={pick} onlineCount={online} />
            ) : (
              <Setup value={pending} onlineCount={online} />
            )}
          </section>

          {err && <p className="hint">{t(err)}</p>}
          {isHost && (
            <>
              {online < min && <p className="status">{t("lobby.needPlayers", { min })}</p>}
              {online > max && <p className="hint">{t("lobby.tooManyPlayers", { max })}</p>}
              <button className="primary" disabled={!canStart} onClick={() => onStart(opts)}>
                {t(game.startKey)}
              </button>
            </>
          )}
          <RulesCard rules={game.rules(isHost ? opts : pending)} />
        </section>
      </div>
    </main>
  );
}
