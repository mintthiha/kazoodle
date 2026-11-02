import { useT } from "../i18n";

// Back to the shelf of games.
export function BackNav({ onExit }: { onExit: () => void }) {
  const { t } = useT();

  return (
    <nav className="session-nav">
      <button className="back" onClick={onExit}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.25" />
        </svg>
        {t("nav.allGames")}
      </button>
    </nav>
  );
}
