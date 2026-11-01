import { useState, type CSSProperties } from "react";
import { useT } from "../../i18n";
import type { RoleAssignment } from "./gen/imposter_pb";

function EyeIcon() {
  return (
    <svg className="slip-eye" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

interface RevealProps {
  role: RoleAssignment;
  /** Called every time the slip is turned face up. */
  onReveal: () => void;
}

// The secret itself, on a slip of paper that starts face down. These phones are
// out in the open in one room, so nothing shows until its owner asks for it, and
// tapping again hides it before the phone goes back on the table.
export function RevealSlip({ role, onReveal }: RevealProps) {
  const { t } = useT();
  const [shown, setShown] = useState(false);

  function toggle() {
    if (!shown) onReveal();
    setShown(!shown);
  }

  if (!shown) {
    return (
      <button className="slip slip-down" onClick={toggle} aria-pressed={false}>
        <EyeIcon />
        <span className="slip-prompt">{t("imposter.slipShow")}</span>
        <span className="slip-note">{t("imposter.slipPrivate")}</span>
      </button>
    );
  }

  if (role.isImposter) {
    return (
      <button className="slip slip-imposter slip-turned" onClick={toggle} aria-pressed={true}>
        <span className="slip-note">{t("imposter.categoryLabel", { category: role.category })}</span>
        <span className="slip-verdict">{t("imposter.youAreImposter")}</span>
        <span className="slip-note">
          {role.hint
            ? t("imposter.imposterHintText", { hint: role.hint })
            : t("imposter.imposterHint")}
        </span>
        <span className="slip-hide">{t("imposter.slipHide")}</span>
      </button>
    );
  }

  return (
    <button className="slip slip-paper slip-turned" onClick={toggle} aria-pressed={true}>
      <span className="slip-note">{role.category}</span>
      {/* The word sizes itself to the slip by its own length, so "Cat" is huge
          and "Réfrigérateur" still fits on one line. See .slip-word. */}
      <span className="slip-word" style={{ "--len": [...role.word].length } as CSSProperties}>
        <mark>{role.word}</mark>
      </span>
      <span className="slip-note">{t("imposter.crewHint")}</span>
      <span className="slip-hide">{t("imposter.slipHide")}</span>
    </button>
  );
}

// The same secret, kept within reach for the rest of the round. Everyone forgets
// the word the moment it is their turn, and asking the room would rather give
// the game away. Face down by default for the same reason as the big slip.
export function WordPeek({ role }: { role: RoleAssignment | null }) {
  const { t } = useT();
  const [shown, setShown] = useState(false);

  if (!role) return null;

  return (
    <button className="peek" onClick={() => setShown(!shown)} aria-pressed={shown}>
      {shown ? (
        <>
          {role.isImposter ? (
            <span className="peek-chip peek-chip-imposter">{t("imposter.youAreImposter")}</span>
          ) : (
            <span className="peek-chip">{role.word}</span>
          )}
          <span className="peek-meta">{role.category}</span>
          <span className="peek-action">{t("imposter.peekHide")}</span>
        </>
      ) : (
        <>
          <EyeIcon />
          <span>{t("imposter.peekShow")}</span>
        </>
      )}
    </button>
  );
}
