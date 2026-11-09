import type { ReactNode } from "react";
import { useT } from "../../../i18n";

interface Props {
  psychic: string;
  /** The Clue Givers' names, already joined: "Ben and Cleo". */
  givers: string;
  isPsychic: boolean;
  /** The Clue Giver's own number, face down. Absent for the Psychic. */
  number?: ReactNode;
  onReady: () => void;
}

// A spoken round: the talking happens out loud, at the table or on a call, so
// this screen is the steps, the Clue Givers' number, and for the Psychic the way
// on to the guess.
export function TalkScreen({ psychic, givers, isPsychic, number, onReady }: Props) {
  const { t } = useT();

  return (
    <main className="screen">
      <h1 className="wl-headline">{t("wl.talkHeading")}</h1>

      <ol className="wl-talk">
        <li>{t("wl.talkCategory", { who: psychic })}</li>
        <li>{t("wl.talkAnswers", { who: givers })}</li>
        <li>{t("wl.talkRepeatOnline", { who: psychic })}</li>
      </ol>

      {number}

      {isPsychic && (
        <div className="dock">
          <button className="primary" onClick={onReady}>
            {t("wl.readyToGuessSelf")}
          </button>
        </div>
      )}
    </main>
  );
}
