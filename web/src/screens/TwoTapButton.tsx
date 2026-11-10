import { useEffect, useState } from "react";

const CONFIRM_MS = 3000;

interface Props {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
}

// For things that cannot be taken back: the first tap arms it, the second does
// it. A phone passed between people, or a host ending a match for the whole
// room, should not be one stray thumb away from losing a game.
export function TwoTapButton({ label, confirmLabel, onConfirm }: Props) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [armed]);

  return (
    <button className="danger" data-armed={armed} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirmLabel : label}
    </button>
  );
}
