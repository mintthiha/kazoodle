import { useT, type MessageKey } from "../../i18n";

/** The four stages a round visibly moves through. The steal counts as part of
 * the vote: it only ever happens as the vote's aftermath. */
export type Stage = "word" | "clues" | "vote" | "results";

const STAGES: { id: Stage; labelKey: MessageKey }[] = [
  { id: "word", labelKey: "imposter.phase.word" },
  { id: "clues", labelKey: "imposter.phase.clues" },
  { id: "vote", labelKey: "imposter.phase.vote" },
  { id: "results", labelKey: "imposter.phase.results" },
];

interface Props {
  stage: Stage;
  round: number;
  totalRounds: number;
}

// Where the room is in the round. Someone handed a phone mid-game, or looking
// back at it after a drink, should be able to tell at a glance.
export function GameHeader({ stage, round, totalRounds }: Props) {
  const { t } = useT();

  return (
    <header className="game-bar">
      <ol className="stages" aria-label={t("imposter.phaseLabel")}>
        {STAGES.map((s) => (
          <li key={s.id} aria-current={s.id === stage ? "step" : undefined}>
            {t(s.labelKey)}
          </li>
        ))}
      </ol>
      {totalRounds > 1 && (
        <span className="round-count num">{t("imposter.roundOf", { round, total: totalRounds })}</span>
      )}
    </header>
  );
}
