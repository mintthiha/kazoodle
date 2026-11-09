import { useT } from "../../i18n";
import { Avatar } from "../../players/Avatar";

/** One line of the standings, ready to draw. */
export interface StandingRow {
  key: string;
  name: string;
  hue: number;
  score: number;
  /** Points won this round, shown beside the total. Left out at the end. */
  delta?: number;
}

interface Props {
  /** Already in the order to show them, highest score first. */
  rows: StandingRow[];
}

// Everyone's running total. Whoever is in the lead is on marker yellow, the
// colour this app spends on whatever is winning.
export function Standings({ rows }: Props) {
  const { t } = useT();
  const best = Math.max(...rows.map((r) => r.score));

  return (
    <section>
      <h2>{t("wl.standings")}</h2>
      <ol className="wl-standings">
        {rows.map((r) => (
          <li key={r.key} className="wl-standing" data-lead={r.score === best}>
            <Avatar name={r.name} hue={r.hue} />
            <span className="roster-name">{r.name}</span>
            {r.delta !== undefined && r.delta > 0 && <span className="wl-delta num">+{r.delta}</span>}
            <span className="wl-score num">{r.score}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
