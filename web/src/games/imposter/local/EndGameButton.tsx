import { useEffect, useState } from "react";
import { useT } from "../../../i18n";

const CONFIRM_MS = 3000;

// Takes two taps. This phone is being passed between people mid-game, and one
// stray thumb here would throw away the word and the imposter for the whole table.
export function EndGameButton({ onEnd }: { onEnd: () => void }) {
  const { t } = useT();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [armed]);

  return (
    <button className="danger" onClick={() => (armed ? onEnd() : setArmed(true))}>
      {armed ? t("local.endGameConfirm") : t("local.endGame")}
    </button>
  );
}
