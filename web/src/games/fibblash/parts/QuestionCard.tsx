import { useT } from "../../../i18n";
import type { QuestionIntro } from "../gen/fibblash_pb";
import { KIND_HELP, KIND_NAME, categoryKey } from "../labels";

/** The prompt, with its "____" drawn as a blank to fill rather than as
 * underscores. A prompt without one (a creative prompt) is just text. */
export function Prompt({ text }: { text: string }) {
  const parts = text.split(/_{2,}/);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && <span className="fb-blank" aria-label="blank" />}
        </span>
      ))}
    </>
  );
}

interface Props {
  question: QuestionIntro;
  /** Show the one-line "what to do" under the prompt. */
  withHelp?: boolean;
}

// The question as everyone sees it: what kind it is, its category, the prompt.
// The kind's colour runs through the whole question (see fibblash.css), so a
// glance at any screen says which game is being played right now.
export function QuestionCard({ question, withHelp = false }: Props) {
  const { t } = useT();
  const cat = categoryKey(question.category);
  return (
    <section className="fb-question" data-kind={question.kind}>
      <p className="fb-kind">
        <span className="fb-kind-tag">{t(KIND_NAME[question.kind])}</span>
        {cat && <span className="fb-category">{t(cat)}</span>}
      </p>
      <h1 className="fb-prompt">
        <Prompt text={question.prompt} />
      </h1>
      {withHelp && <p className="status">{t(KIND_HELP[question.kind])}</p>}
    </section>
  );
}
