import { useEffect, useRef, type ReactNode } from "react";
import { useConnection } from "../net/useConnection";
import { useT } from "../i18n";
import { gameViews } from "../games/registry";
import { encodeStartOptions } from "../games/imposter/messages";
import { ConnBanner } from "./ConnBanner";
import { JoinScreen } from "./JoinScreen";
import { LobbyScreen } from "./LobbyScreen";
import { RoomNotice } from "./RoomNotice";

interface Props {
  /** Which game the hub sent us here to play. Only used for the start call for
   * now; the running view comes from the server's own game id. */
  gameId: string;
  onExit: () => void;
}

// Everything behind a picked game: the socket, the join screen, the lobby and
// the running game. Mounting this component is what opens the connection —
// useConnection creates the socket on its first call — so the hub stays
// network-free until someone actually picks a game.
export function GameSession({ gameId, onExit }: Props) {
  const { snapshot, actions } = useConnection();
  const { locale, t } = useT();

  // Leaving this screen while still in a room — browser Back, mostly — has to
  // tell the server, or that player stays on the roster as a phantom nobody
  // can vote out. The ref holds the latest value for the cleanup to read: the
  // cleanup below runs once, at unmount, and a closure over `snapshot` would
  // have captured whatever it was on the first render.
  const inRoom = useRef(false);
  inRoom.current = snapshot.room !== null;

  useEffect(() => {
    const leave = actions.leaveRoom;
    return () => {
      if (inRoom.current) leave();
    };
  }, [actions.leaveRoom]);

  let content: ReactNode;
  if (snapshot.room && snapshot.game) {
    const GameView = gameViews[snapshot.game.id];
    content = GameView ? (
      <GameView
        selfId={snapshot.room.selfId}
        players={snapshot.room.players}
        departed={snapshot.room.departed}
        isHost={snapshot.room.hostId === snapshot.room.selfId}
      />
    ) : (
      <main className="screen">
        <p className="hint">{t("game.unknown")}</p>
      </main>
    );
  } else if (snapshot.room) {
    content = (
      <LobbyScreen
        room={snapshot.room}
        lastEcho={snapshot.lastEcho}
        isHost={snapshot.room.hostId === snapshot.room.selfId}
        onStartGame={(hintsEnabled, category) =>
          actions.startGame(gameId, encodeStartOptions(hintsEnabled, category))
        }
        onSetCategory={(hintsEnabled, category) =>
          actions.setGameOptions(gameId, encodeStartOptions(hintsEnabled, category))
        }
        onEcho={actions.echo}
        onLeave={actions.leaveRoom}
      />
    );
  } else {
    content = (
      <JoinScreen
        snapshot={snapshot}
        onCreate={(name) => actions.createRoom(name, locale)}
        onJoin={(code, name) => actions.joinRoom(code, name, locale)}
      />
    );
  }

  return (
    <>
      <ConnBanner state={snapshot.state} />
      {/* Only inside a room: a departure from the room someone just left is
          not news on the join screen. */}
      {snapshot.room && (
        <RoomNotice departure={snapshot.lastDeparture} gameEnd={snapshot.lastGameEnd} />
      )}
      {/* Back to the shelf, offered only before joining a room: once players
          are in a room, Leave is the way out, and two exits side by side is
          one too many. */}
      {!snapshot.room && (
        <nav className="session-nav">
          <button className="back" onClick={onExit}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.25" />
            </svg>
            {t("nav.allGames")}
          </button>
        </nav>
      )}
      {content}
    </>
  );
}
