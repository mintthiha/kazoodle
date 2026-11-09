import { useState } from "react";
import { useT } from "../../i18n";

interface Props {
  secret: number;
  /** Called every time the slip is turned face up. */
  onReveal: () => void;
}

// The secret number on a slip of paper that starts face down, the same material
// as Imposter's word slip. The phone is being handed across a table with the
// Psychic sitting at it, so nothing shows until the person holding it asks, and
// tapping again hides it before it moves on.
export function NumberSlip({ secret, onReveal }: Props) {
  const { t } = useT();
  const [shown, setShown] = useState(false);

  function toggle() {
    if (!shown) onReveal();
    setShown(!shown);
  }

  if (!shown) {
    return (
      <button className="wl-slip wl-slip-down" onClick={toggle} aria-pressed={false}>
        <span className="wl-slip-prompt">{t("wl.slipShow")}</span>
        <span className="wl-slip-note">{t("imposter.slipPrivate")}</span>
      </button>
    );
  }

  return (
    <button className="wl-slip wl-slip-paper" onClick={toggle} aria-pressed={true}>
      <span className="wl-slip-note">{t("wl.theNumber")}</span>
      <span className="wl-slip-number num">
        <mark>{secret}</mark>
      </span>
      <span className="wl-slip-note">{t("wl.scale")}</span>
      <span className="wl-slip-hide">{t("imposter.slipHide")}</span>
    </button>
  );
}
