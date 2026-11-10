import { Countdown } from "../../../clock/Countdown";
import { useCountdown } from "../../../clock/useCountdown";
import { useT } from "../../../i18n";
import type { View } from "../view";

// The current phase's clock. Only ever a display: the server ends the phase,
// and a phone that slept wakes with a full bar that the next message corrects.
export function Clock({ view }: { view: View }) {
  const { t } = useT();
  const left = useCountdown(view.seconds, view.clockKey);
  if (left === null) return null;
  return (
    <Countdown
      seconds={left}
      total={view.seconds}
      label={left > 0 ? t("fb.secondsLeft", { n: left }) : t("fb.timeUp")}
    />
  );
}
