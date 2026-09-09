import { useConnection } from "./net/useConnection";
import { useT, type Locale } from "./i18n";
import { ConnBanner } from "./screens/ConnBanner";
import { JoinScreen } from "./screens/JoinScreen";
import { LobbyScreen } from "./screens/LobbyScreen";

const LOCALES: Locale[] = ["en", "fr"];

export function App() {
  const { snapshot, actions } = useConnection();
  const { locale, setLocale, t } = useT();

  return (
    <div className="app">
      <ConnBanner state={snapshot.state} />

      {snapshot.room ? (
        <LobbyScreen
          room={snapshot.room}
          lastEcho={snapshot.lastEcho}
          onEcho={actions.echo}
          onLeave={actions.leaveRoom}
        />
      ) : (
        <JoinScreen snapshot={snapshot} onCreate={actions.createRoom} onJoin={actions.joinRoom} />
      )}

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
