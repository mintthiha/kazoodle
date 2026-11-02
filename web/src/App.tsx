import type { ReactNode } from "react";
import { useT, type Locale } from "./i18n";
import { GAME_IDS, LOCAL_GAME_IDS, localGameViews } from "./games/registry";
import { useRoute } from "./nav/useRoute";
import { routePath, type Route } from "./nav/route";
import { HomeScreen } from "./screens/home/HomeScreen";
import { GameSession } from "./screens/GameSession";

const LOCALES: Locale[] = ["en", "fr"];

// Wiring only: pick the screen the URL asks for, and keep the language footer
// on all of them. "/" is the hub; "/<game-id>" is that game's session;
// "/<game-id>/local" is the same game on one device, with no session.
export function App() {
  const { route, navigate } = useRoute(GAME_IDS, LOCAL_GAME_IDS);
  const { locale, setLocale, t } = useT();

  function go(next: Route) {
    navigate(routePath(next));
  }

  const toHome = () => go({ kind: "home" });

  let screen: ReactNode;
  if (route.kind === "game") {
    screen = <GameSession gameId={route.id} onExit={toHome} />;
  } else if (route.kind === "local") {
    const LocalView = localGameViews[route.id];
    screen = <LocalView onExit={toHome} />;
  } else {
    screen = (
      <HomeScreen
        onPick={(id) => go({ kind: "game", id })}
        onPickLocal={(id) => go({ kind: "local", id })}
      />
    );
  }

  return (
    <div className="app">
      {screen}
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
