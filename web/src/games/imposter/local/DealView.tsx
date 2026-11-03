import { useState } from "react";
import { useT } from "../../../i18n";
import { RevealSlip } from "../WordSlip";
import { roleFor, type LocalGame } from "./localGame";

interface Props {
  game: LocalGame;
  seat: number;
  onNext: () => void;
}

// One player's private moment with the phone. The online reveal screen's slip,
// with a roster-free screen around it: the only other thing here is whose turn it
// is to hold the phone, so nobody looks at a word that was not meant for them.
export function DealView({ game, seat, onNext }: Props) {
  const { locale, t } = useT();
  // Next player means "I have read mine", so it waits until they have. Without
  // this, one tap too many would skip somebody's word entirely.
  const [seen, setSeen] = useState(false);

  const total = game.names.length;
  const last = seat === total - 1;
  const role = roleFor(game, seat, locale);

  return (
    <main className="screen">
      <div>
        <h1>{t("local.passTo", { who: game.names[seat] })}</h1>
        <p className="status num">{t("local.dealProgress", { n: seat + 1, total })}</p>
      </div>

      <RevealSlip role={role} partnerName={role.partner} onReveal={() => setSeen(true)} />

      <div className="dock">
        <button className="primary" disabled={!seen} onClick={onNext}>
          {last ? t("local.startPlaying") : t("local.nextPlayer")}
        </button>
      </div>
    </main>
  );
}
