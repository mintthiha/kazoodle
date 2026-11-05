import { HIGHEST, LOWEST } from "./localGame";

interface Props {
  /** What the pad is for, for screen readers. The heading above says it on screen. */
  label: string;
  value: number | null;
  onPick: (value: number) => void;
}

const NUMBERS = Array.from({ length: HIGHEST - LOWEST + 1 }, (_, i) => LOWEST + i);

// Every number from 1 to 10 as its own big key, in two rows of five. Tapping only
// selects; the button under the pad commits, so a thumb that lands on 6 instead of
// 7 can be corrected before anything is decided.
export function NumberPad({ label, value, onPick }: Props) {
  return (
    <div className="wl-pad" role="group" aria-label={label}>
      {NUMBERS.map((n) => (
        <button key={n} className="wl-key num" aria-pressed={value === n} onClick={() => onPick(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}
