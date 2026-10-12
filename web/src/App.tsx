import { useT, type Locale } from "./i18n";
import { GAME_IDS } from "./games/registry";
import { useRoute } from "./nav/useRoute";
import { routePath } from "./nav/route";
import { HomeScreen } from "./screens/home/HomeScreen";
import { GameSession } from "./screens/GameSession";

const LOCALES: Locale[] = ["en", "fr"];

// Wiring only: pick the screen the URL asks for, and keep the language footer
// on both. "/" is the hub; "/<game-id>" is that game's session.
export function App() {
  const { route, navigate } = useRoute(GAME_IDS);
  const { locale, setLocale, t } = useT();

  return (
    <div className="app">
      {route.kind === "home" ? (
        <HomeScreen onPick={(id) => navigate(routePath({ kind: "game", id }))} />
      ) : (
        <GameSession gameId={route.id} onExit={() => navigate(routePath({ kind: "home" }))} />
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
