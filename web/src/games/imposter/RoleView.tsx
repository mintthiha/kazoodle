import { useState } from "react";
import { useT } from "../../i18n";
import { Avatar } from "../../players/Avatar";
import { makeHueFor } from "../../players/hues";
import type { RevealProgress, RoleAssignment } from "./gen/imposter_pb";
import type { GameViewProps } from "../registry";
import { makeNameFor } from "../../players/nameFor";
import { RevealSlip } from "./WordSlip";

interface Props extends GameViewProps {
  role: RoleAssignment | null;
  progress: RevealProgress | null;
  ready: boolean;
  onConfirm: () => void;
}

// The reveal screen: show this player their role, let them confirm, and show
// how many others have.
export function RoleView({ role, progress, ready, selfId, players, departed, onConfirm }: Props) {
  const { t } = useT();
  // "Got it" means "I have read my word", so it waits until they have.
  const [seen, setSeen] = useState(false);

  if (!role) {
    return (
      <main className="screen">
        <p className="status">{t("imposter.dealing")}</p>
      </main>
    );
  }

  const name = makeNameFor(players, departed, t);
  const hue = makeHueFor(players, departed);
  const readyIds = new Set(progress?.readyPlayerIds ?? []);
  const total = progress?.total ?? players.length;

  return (
    <main className="screen">
      <h1>{t("imposter.heading")}</h1>

      <RevealSlip
        role={role}
        onReveal={() => setSeen(true)}
        partnerName={role.partnerId ? name(role.partnerId) : undefined}
      />

      <section>
        <h2 className="num">{t("imposter.readyCount", { ready: readyIds.size, total })}</h2>
        <ul className="roster">
          {players.map((p) => (
            <li key={p.id} className="roster-row" data-ready={readyIds.has(p.id)}>
              <Avatar name={name(p.id)} hue={hue(p.id)} />
              <span className="roster-name">
                {name(p.id)}
                {p.id === selfId && <span className="you"> ({t("lobby.you")})</span>}
              </span>
              {readyIds.has(p.id) && (
                <svg className="ready-tick" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 13l4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="2.5" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="dock">
        <button className="primary" onClick={onConfirm} disabled={ready || !seen}>
          {ready ? t("imposter.waiting") : t("imposter.gotIt")}
        </button>
      </div>
    </main>
  );
}
