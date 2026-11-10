import { useT } from "../../../i18n";
import type { MatchupResult } from "../gen/fibblash_pb";
import { Awards } from "./Awards";
import type { People } from "./people";

// One CREATIVE matchup with its votes in: who wrote each answer, who voted for
// it, and which one won.
export function MatchupReveal({ result, people }: { result: MatchupResult; people: People }) {
  const { t } = useT();
  const names = (ids: string[]) => people.list(ids.map(people.nameFor));

  return (
    <>
      <p className="status">{t("fb.matchupOf", { n: result.matchup, total: result.matchups })}</p>
      <ul className="fb-reveal" role="list">
        {result.choices.map((c) => {
          const won = result.winnerIds.includes(c.id);
          return (
            <li key={c.id} className="fb-reveal-item" data-won={won}>
              {won && <span className="pill fb-win-pill">{t("fb.winner")}</span>}
              <p className="fb-reveal-text">{c.text}</p>
              <p className="fb-reveal-meta">{t("fb.answerBy", { who: names(c.authorIds) })}</p>
              <p className="fb-reveal-meta">
                {c.voterIds.length > 0 ? t("fb.votes", { who: names(c.voterIds) }) : t("fb.noVotes")}
              </p>
            </li>
          );
        })}
      </ul>
      <Awards awards={result.awards} people={people} />
    </>
  );
}
