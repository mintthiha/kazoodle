import { useT } from "../../../i18n";
import { Avatar } from "../../../players/Avatar";
import type { Award } from "../gen/fibblash_pb";
import { AWARD } from "../labels";
import type { People } from "./people";

// Who scored what on the reveal just shown, one line per player, biggest first.
export function Awards({ awards, people }: { awards: Award[]; people: People }) {
  const { t } = useT();

  // The server sends one award per player per reason: a player who found the
  // truth and fooled two people has two. Sum them into one line each.
  const byPlayer = new Map<string, { total: number; reasons: string[] }>();
  for (const a of awards) {
    const row = byPlayer.get(a.playerId) ?? { total: 0, reasons: [] };
    row.total += a.points;
    row.reasons.push(t(AWARD[a.reason], { n: a.count }));
    byPlayer.set(a.playerId, row);
  }
  const rows = [...byPlayer.entries()].sort((a, b) => b[1].total - a[1].total);
  if (rows.length === 0) return null;

  return (
    <ul className="fb-awards" role="list">
      {rows.map(([id, row]) => (
        <li key={id} className="fb-award" data-self={id === people.selfId}>
          <Avatar name={people.nameFor(id)} hue={people.hueFor(id)} />
          <span className="roster-name">{people.nameFor(id)}</span>
          <span className="fb-award-why">{row.reasons.join(" · ")}</span>
          <span className="fb-delta num">{t("fb.points", { n: row.total })}</span>
        </li>
      ))}
    </ul>
  );
}
