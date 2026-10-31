import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n";

/** How the game is played, for the lobby. Six lines, in the order a round
 * happens, so someone handed a phone mid-party can read it in the time it
 * takes the host to press Start.
 *
 * Kept as keys rather than prose so the list can be reordered or trimmed
 * without touching the markup — and so both languages stay in step. */
const RULES: MessageKey[] = [
  "imposter.rule.word",
  "imposter.rule.clues",
  "imposter.rule.vote",
  "imposter.rule.steal",
  "imposter.rule.scoring",
  "imposter.rule.fairPlay",
];

export function RulesCard() {
  const { t } = useT();

  return (
    <section className="rules-card">
      <h2>{t("imposter.rulesHeading")}</h2>
      <ol className="rules-list">
        {RULES.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ol>
    </section>
  );
}
