import { useT } from "../../../i18n";
import { Avatar } from "../../../players/Avatar";
import { makeSeatHue } from "../../onephone/seatHue";
import { leaders } from "./localGame";

interface Props {
  names: string[];
  scores: number[];
  /** Points each seat won this round, shown beside the total. Left out at the end. */
  deltas?: number[];
}

// Everyone's running total, highest first. Whoever is in the lead is on marker
// yellow, the colour this app spends on whatever is winning.
export function Standings({ names, scores, deltas }: Props) {
  const { t } = useT();
  const hue = makeSeatHue(names.length);
  const top = leaders(scores);
  // Ties keep seat order, so two players on the same score never swap places
  // between one round and the next for no reason.
  const order = names.map((_, seat) => seat).sort((a, b) => scores[b] - scores[a] || a - b);

  return (
    <section>
      <h2>{t("wl.standings")}</h2>
      <ol className="wl-standings">
        {order.map((seat) => (
          <li key={seat} className="wl-standing" data-lead={top.includes(seat)}>
            <Avatar name={names[seat]} hue={hue(seat)} />
            <span className="roster-name">{names[seat]}</span>
            {deltas && deltas[seat] > 0 && <span className="wl-delta num">+{deltas[seat]}</span>}
            <span className="wl-score num">{scores[seat]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
