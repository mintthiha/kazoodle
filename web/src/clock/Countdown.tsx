import type { CSSProperties } from "react";
import "./clock.css";

interface Props {
  /** Seconds left, as the caller's countdown currently reads. */
  seconds: number;
  /** What the clock started from, so the bar can show the true share left. */
  total: number;
  label: string;
}

// A shrinking bar and the time in words. Only ever a display: the server's clock
// is the one that ends the phase. It stays quiet for a screen reader (role
// "timer" is not announced every tick) because a voice reading out every second
// would be worse than no timer at all.
export function Countdown({ seconds, total, label }: Props) {
  const share = total > 0 ? Math.min(1, seconds / total) : 0;
  // "Running low" means the last five seconds of a longer clock. A clock
  // that is only five seconds long to begin with (a "get ready" pause) would
  // otherwise be red, and throbbing, from start to finish.

  return (
    <div className="countdown" role="timer" data-low={seconds <= 5 && total > 5}>
      <span className="countdown-bar" aria-hidden="true">
        <span className="countdown-fill" style={{ "--share": share } as CSSProperties} />
      </span>
      <span className="countdown-label num">{label}</span>
    </div>
  );
}
