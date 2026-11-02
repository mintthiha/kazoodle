import { BRAND } from "../../brand";
import { useT } from "../../i18n";
import { GAMES } from "../../games/registry";
import { GameTile } from "./GameTile";
import "./home.css";

interface Props {
  onPick: (gameId: string) => void;
  onPickLocal: (gameId: string) => void;
}

// The hub: the shelf of games, and the first thing anyone sees. It holds no
// connection — the socket opens only once a game is picked (see GameSession),
// so browsing the shelf costs the server nothing.
export function HomeScreen({ onPick, onPickLocal }: Props) {
  const { t } = useT();

  return (
    <main className="screen home">
      <header className="home-head">
        {/* The slip is decoration: a screen reader should hear one word, once,
            not "K Kazoodle". */}
        <h1 className="wordmark">
          <span className="brand-mark" aria-hidden="true">
            {BRAND.name.slice(0, 1)}
          </span>
          {BRAND.name}
        </h1>
        <p className="home-tagline">{t("home.tagline")}</p>
      </header>

      <ul className="shelf">
        {GAMES.map((game) => (
          <li key={game.id}>
            <GameTile game={game} onPick={onPick} onPickLocal={onPickLocal} />
          </li>
        ))}
        <li className="soon">
          <p className="soon-title">{t("home.soonTitle")}</p>
          <p className="soon-body">{t("home.soonBody")}</p>
        </li>
      </ul>
    </main>
  );
}
