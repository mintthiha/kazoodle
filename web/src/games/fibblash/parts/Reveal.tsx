import { useT } from "../../../i18n";
import { Kind, type QuestionResult } from "../gen/fibblash_pb";
import { Awards } from "./Awards";
import type { People } from "./people";

// A REAL or HYBRID question revealed: every lie with who wrote it and who fell
// for it, then the truth, last, because that is the moment the room waits for.
export function Reveal({ result, people }: { result: QuestionResult; people: People }) {
  const { t } = useT();
  const lies = result.choices.filter((c) => !c.truth);
  const truth = result.choices.find((c) => c.truth);
  const hybrid = result.kind === Kind.HYBRID;
  const names = (ids: string[]) => people.list(ids.map(people.nameFor));

  return (
    <>
      {lies.length > 0 && (
        <ul className="fb-reveal" role="list">
          {lies.map((c) => (
            <li key={c.id} className="fb-reveal-item" data-fooled={c.voterIds.length > 0}>
              <p className="fb-reveal-text">{c.text}</p>
              <p className="fb-reveal-meta">{t("fb.lieBy", { who: names(c.authorIds) })}</p>
              {c.voterIds.length > 0 && (
                <p className="fb-reveal-meta fb-fooled">{t("fb.fooled", { who: names(c.voterIds) })}</p>
              )}
              {hybrid && c.funnyVoterIds.length > 0 && (
                <p className="fb-reveal-meta">{t("fb.funnyVotes", { who: names(c.funnyVoterIds) })}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="fb-truth">
        <p className="fb-truth-label">{t("fb.theTruth")}</p>
        <p className="fb-truth-text">{result.answer}</p>
        <p className="fb-reveal-meta">
          {truth && truth.voterIds.length > 0 ? t("fb.foundIt", { who: names(truth.voterIds) }) : t("fb.nobodyFound")}
        </p>
        {hybrid && truth && truth.funnyVoterIds.length > 0 && (
          <p className="fb-reveal-meta">{t("fb.funnyVotes", { who: names(truth.funnyVoterIds) })}</p>
        )}
        {result.explanation && <p className="fb-explanation">{result.explanation}</p>}
        {result.source && <p className="fb-source">{t("fb.source", { source: result.source })}</p>}
      </section>

      <Awards awards={result.awards} people={people} />
    </>
  );
}
