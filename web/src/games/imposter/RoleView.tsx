import { useT } from "../../i18n";
import type { RevealProgress, RoleAssignment } from "./gen/imposter_pb";
import type { GameViewProps } from "../registry";

interface Props extends GameViewProps {
  role: RoleAssignment | null;
  progress: RevealProgress | null;
  ready: boolean;
  onConfirm: () => void;
}

// The reveal screen: show this player their role, let them confirm, and show
// how many others have.
export function RoleView({ role, progress, ready, selfId, players, onConfirm }: Props) {
  const { t } = useT();

  if (!role) {
    return (
      <main className="screen">
        <p className="hint">{t("imposter.dealing")}</p>
      </main>
    );
  }

  const readyIds = new Set(progress?.readyPlayerIds ?? []);
  const total = progress?.total ?? players.length;

  return (
    <main className="screen">
      <h1>{t("imposter.heading")}</h1>

      {role.isImposter ? (
        <section className="role-card role-imposter">
          <p className="role-word">{t("imposter.youAreImposter")}</p>
          <p className="role-hint">{t("imposter.imposterHint")}</p>
        </section>
      ) : (
        <section className="role-card role-crew">
          <p className="role-label">{role.category}</p>
          <p className="role-word">{role.word}</p>
          <p className="role-hint">{t("imposter.crewHint")}</p>
        </section>
      )}

      <button className="primary" onClick={onConfirm} disabled={ready}>
        {ready ? t("imposter.waiting") : t("imposter.gotIt")}
      </button>

      <section>
        <h2>{t("imposter.readyCount", { ready: readyIds.size, total })}</h2>
        <ul className="players">
          {players.map((p) => (
            <li key={p.id}>
              <span>{readyIds.has(p.id) ? "✓" : "…"}</span> {p.displayName}
              {p.id === selfId && <span className="you"> ({t("lobby.you")})</span>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
