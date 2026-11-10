import { useT } from "../../i18n";

interface Props {
  gameId: string;
  name: string;
}

// A game's cover art, on the flat colour its registry entry gives it. Imposter's
// cover is the game's whole idea: the same word on every slip, except one. Any
// game added later falls back to its initial until it earns its own cover.
//
// Decorative, hence aria-hidden: the name and hook beside it say the same thing
// in words, and a screen reader should not read "Lighthouse" three times.
export function GameCover({ gameId, name }: Props) {
  const { t } = useT();

  if (gameId === "fibblash") {
    // The spec's own example: four answers to "bubble wrap was first made
    // as…", and only one of them true, highlighted the way the reveal does.
    return (
      <span className="tile-cover" aria-hidden="true">
        <span className="cover-slips">
          <span className="cover-slip">{t("game.fibblash.cover1")}</span>
          <span className="cover-slip">
            <mark>{t("game.fibblash.cover2")}</mark>
          </span>
          <span className="cover-slip">{t("game.fibblash.cover3")}</span>
          <span className="cover-slip">{t("game.fibblash.cover4")}</span>
        </span>
      </span>
    );
  }

  if (gameId === "imposter") {
    const word = t("game.imposter.coverWord");
    return (
      <span className="tile-cover" aria-hidden="true">
        <span className="cover-slips">
          <span className="cover-slip">{word}</span>
          <span className="cover-slip">{word}</span>
          <span className="cover-slip">{word}</span>
          <span className="cover-slip cover-slip-odd">?</span>
        </span>
      </span>
    );
  }

  return (
    <span className="tile-cover" aria-hidden="true">
      <span className="cover-letter">{name.slice(0, 1)}</span>
    </span>
  );
}
