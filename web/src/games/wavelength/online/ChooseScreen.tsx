import { useState } from "react";
import { useT } from "../../../i18n";
import { NumberPad } from "../NumberPad";
import type { Role } from "./view";

interface Props {
  role: Role;
  /** Whether this phone is the one that enters the agreed number. */
  isChooser: boolean;
  psychic: string;
  chooser: string;
  onChoose: (value: number) => void;
}

// A chosen number: the Clue Givers agree on one away from the Psychic, and the
// first of them enters it. Everyone else is told what is going on and waits.
export function ChooseScreen({ role, isChooser, psychic, chooser, onChoose }: Props) {
  const { t } = useT();
  const [picked, setPicked] = useState<number | null>(null);
  const [sent, setSent] = useState(false);

  if (isChooser && !sent) {
    return (
      <main className="screen">
        <div>
          <h1>{t("wl.enterHeading")}</h1>
          <p className="status local-help">{t("wl.chooseChooserHelp", { psychic })}</p>
          <p className="status">{t("wl.scale")}</p>
        </div>
        <NumberPad label={t("wl.pickNumber")} value={picked} onPick={setPicked} />
        <div className="dock">
          <button
            className="primary"
            disabled={picked === null}
            onClick={() => {
              if (picked === null) return;
              setSent(true);
              onChoose(picked);
            }}
          >
            {picked === null ? t("wl.pickNumber") : t("wl.lockNumber", { n: picked })}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen">
      <h1 className="wl-headline">
        {role === "psychic" ? t("wl.chooseWaitPsychic") : t("wl.chooseWaitGiver", { psychic, chooser })}
      </h1>
    </main>
  );
}
