import { useEffect, useState } from "react";

const CONFIRM_MS = 3000;

interface Props {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
}

// For things that cannot be taken back. This phone is being passed between people,
// and one stray thumb should not throw away a game or a list someone typed by hand.
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
