import { useT } from "../../../i18n";
import { Avatar } from "../../../players/Avatar";
import type { Standing } from "../gen/fibblash_pb";
import type { People } from "./people";

interface Props {
  standings: Standing[];
  people: People;
  /** Whoever earned the most on the last question, to call out. */
  topIds?: string[];
  /** Show each row's points from the last question beside its total. */
  withDeltas?: boolean;
}

// The leaderboard: rank, player, the last question's gain, total. Players on
// the same score share a rank, as the server ranks them; nothing breaks a tie.
export function Standings({ standings, people, topIds = [], withDeltas = false }: Props) {
  const { t } = useT();
  return (
    <ol className="fb-standings" role="list">
      {standings.map((s) => {
        const name = people.nameFor(s.playerId);
        const star = topIds.includes(s.playerId);
        return (
          <li
            key={s.playerId}
            className="fb-standing"
            data-lead={s.rank === 1 && s.score > 0}
            data-star={star}
            data-self={s.playerId === people.selfId}
          >
            <span className="fb-rank num">{s.rank}</span>
            <Avatar name={name} hue={people.hueFor(s.playerId)} />
            <span className="roster-name">
              {name}
              {star && <span className="pill fb-star">{t("fb.star")}</span>}
            </span>
            {withDeltas && s.delta > 0 && <span className="fb-delta num">{t("fb.points", { n: s.delta })}</span>}
            <span className="fb-score num">{s.score}</span>
          </li>
        );
      })}
    </ol>
  );
}
