import { useEffect, useRef, type ReactNode } from "react";
import { GAMES, onlineGames } from "../../games/registry";
import { useT } from "../../i18n";
import { useConnection } from "../../net/useConnection";
import { BackNav } from "../BackNav";
import { ConnBanner } from "../ConnBanner";
import { RoomNotice } from "../RoomNotice";
import { errorKey } from "../../errorKey";
import { ScreenLobby } from "./ScreenLobby";
import "./bigscreen.css";

interface Props {
  gameId: string;
  onExit: () => void;
}

// A game hosted from a main screen: a TV or laptop the whole room watches. It
// opens a room by itself, as a screen rather than a player, shows the code
// big, and then shows the game. The players join on their phones as usual.
//
// Mounting this is what opens the connection, as with GameSession.
export function ScreenSession({ gameId, onExit }: Props) {
  const { snapshot, actions } = useConnection();
  const { locale, t } = useT();
  const game = onlineGames[gameId];
  const listing = GAMES.find((g) => g.id === gameId);

  // Open a room once, as soon as the socket is up, unless the connection is
  // already reclaiming one (this tab was reloaded mid-game). Only once: if the
  // room later goes away, the screen says so and offers a button, rather than
  // quietly opening a new room nobody knows the code of.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || snapshot.state !== "open") return;
    opened.current = true;
    if (!actions.wantsRoom()) actions.createRoom("", locale, true);
  }, [snapshot.state, actions, locale]);

  // Leaving the screen (browser Back) leaves the room, as GameSession does.
  const inRoom = useRef(false);
  inRoom.current = snapshot.room !== null;
  useEffect(() => {
    const leave = actions.leaveRoom;
    return () => {
      if (inRoom.current) leave();
    };
  }, [actions.leaveRoom]);

  const room = snapshot.room;
  const self = room?.players.find((p) => p.id === room.selfId);

  let content: ReactNode;
  if (room && self && !self.screen) {
    // This tab was a player in a room before it was pointed at the screen
    // page, and reclaimed that seat. A player's seat cannot become a screen,
    // so let it go and open a proper one.
    content = (
      <main className="screen big-lobby">
        <button className="primary" onClick={() => { actions.leaveRoom(); actions.createRoom("", locale, true); }}>
          {t("home.bigScreen")}
        </button>
      </main>
    );
  } else if (room && snapshot.game) {
    const View = onlineGames[snapshot.game.id]?.screen;
    content = View ? (
      <View selfId={room.selfId} players={room.players} departed={room.departed} isHost={room.hostId === room.selfId} />
    ) : (
      <main className="screen">
        <p className="hint">{t("game.unknown")}</p>
      </main>
    );
  } else if (room && game && listing) {
    content = (
      <ScreenLobby
        room={room}
        gameId={gameId}
        game={game}
        listing={listing}
        lastError={snapshot.lastError}
        onStart={(opts) => actions.startGame(gameId, opts)}
        onSetOptions={(opts) => actions.setGameOptions(gameId, opts)}
        onKick={actions.kickPlayer}
        onLeave={() => {
          actions.leaveRoom();
          onExit();
        }}
      />
    );
  } else {
    const err = errorKey(snapshot.lastError);
    content = (
      <main className="screen big-lobby big-opening">
        <p className="status">{t("screen.opening")}</p>
        {opened.current && snapshot.state === "open" && !actions.wantsRoom() && (
          <>
            {err && <p className="hint">{t(err)}</p>}
            <button className="primary" onClick={() => actions.createRoom("", locale, true)}>
              {t("home.bigScreen")}
            </button>
          </>
        )}
      </main>
    );
  }

  return (
    <>
      <ConnBanner state={snapshot.state} />
      {room && <RoomNotice departure={snapshot.lastDeparture} gameEnd={snapshot.lastGameEnd} />}
      {!room && <BackNav onExit={onExit} />}
      {content}
    </>
  );
}
