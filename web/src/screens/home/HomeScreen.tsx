import { BRAND } from "../../brand";
import { useT } from "../../i18n";
import { GAMES } from "../../games/registry";
import { GameTile } from "./GameTile";
import { GroupMark } from "./GroupMark";
import { HomeBackground } from "./HomeBackground";
import "./home.css";

interface Props {
  onPick: (gameId: string) => void;
}

// The hub: the shelf of games, and the first thing anyone sees. It holds no
// connection — the socket opens only once a game is picked (see GameSession),
// so browsing the shelf costs the server nothing.
export function HomeScreen({ onPick }: Props) {
  const { t } = useT();

  return (
    <main className="screen home">
      <HomeBackground />

      <header className="home-head">
        {/* The letters animate in one at a time, so each needs its own element.
            aria-label keeps it a single word for a screen reader. */}
        <h1 className="wordmark" aria-label={BRAND.name}>
          {[...BRAND.name].map((char, i) => (
            <span key={`${char}${i}`} aria-hidden="true" style={{ animationDelay: `${i * 55}ms` }}>
              {char}
            </span>
          ))}
        </h1>
        <p className="home-tagline">{t("home.tagline")}</p>
        <GroupMark />
      </header>

      <ul className="shelf">
        {GAMES.map((game, i) => (
          <li key={game.id}>
            <GameTile game={game} index={i} onPick={onPick} />
          </li>
        ))}
        <li className="soon" style={{ animationDelay: `${420 + GAMES.length * 90}ms` }}>
          <p className="soon-title">{t("home.soonTitle")}</p>
          <p className="soon-body">{t("home.soonBody")}</p>
        </li>
      </ul>
    </main>
  );
}
