import type { ReactNode } from "react";
import { useConnection } from "./net/useConnection";
import { useT, type Locale } from "./i18n";
import { gameViews } from "./games/registry";
import { ConnBanner } from "./screens/ConnBanner";
import { JoinScreen } from "./screens/JoinScreen";
import { LobbyScreen } from "./screens/LobbyScreen";

const LOCALES: Locale[] = ["en", "fr"];

export function App() {
  const { snapshot, actions } = useConnection();
  const { locale, setLocale, t } = useT();

  let content: ReactNode;
  if (snapshot.room && snapshot.game) {
    const GameView = gameViews[snapshot.game.id];
    content = GameView ? (
      <GameView
        selfId={snapshot.room.selfId}
        players={snapshot.room.players}
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
        onStartGame={() => actions.startGame("imposter")}
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
    <div className="app">
      <ConnBanner state={snapshot.state} />
      {content}
      <footer className="lang">
        <span>{t("app.language")}:</span>
        {LOCALES.map((l) => (
          <button key={l} aria-pressed={locale === l} onClick={() => setLocale(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </footer>
    </div>
  );
}
