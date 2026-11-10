import { useT } from "../../../i18n";
import type { FinalResult } from "../gen/fibblash_pb";
import type { People } from "./people";
import { Standings } from "./Standings";

// The end of the match: who won, then everyone's total. A tie names everyone in
// it; nothing is decided at random.
export function FinalBoard({ final, people }: { final: FinalResult; people: People }) {
  const { t } = useT();
  const winners = final.winnerIds.map(people.nameFor);

  let headline: string;
  if (winners.length === 0) headline = t("fb.noWinner");
  else if (winners.length === 1) headline = t("fb.wins", { who: winners[0] });
  else headline = t("fb.tieWin", { who: people.list(winners) });

  return (
    <>
      <section className="fb-final" data-winner={winners.length > 0}>
        <p className="fb-truth-label">{t("fb.finalScores")}</p>
        <h1 className="fb-final-headline">{headline}</h1>
        {final.endedEarly && <p className="status">{t("fb.endedEarly")}</p>}
      </section>
      <Standings standings={final.standings} people={people} />
    </>
  );
}
