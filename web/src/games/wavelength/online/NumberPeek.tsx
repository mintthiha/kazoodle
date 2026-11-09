import { useState } from "react";
import { useT } from "../../../i18n";

interface Props {
  secret: number;
  /** The Psychic's name, for the reminder to keep it hidden from them. */
  psychic: string;
}

// A Clue Giver's number on their own phone, face down until they hold it open.
// Phones get waved around a room, and the Psychic may be sitting right there.
export function NumberPeek({ secret, psychic }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <button className="wl-peek" aria-pressed={open} onClick={() => setOpen(!open)}>
      {open ? (
        <>
          <span className="wl-peek-number num">
            <mark>{secret}</mark>
          </span>
          <span className="wl-peek-action">{t("imposter.peekHide")}</span>
        </>
      ) : (
        <>
          <span>{t("wl.peekMine")}</span>
          <span className="wl-peek-note">{t("wl.peekNote", { who: psychic })}</span>
        </>
      )}
    </button>
  );
}
