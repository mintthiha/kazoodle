import { useT } from "../i18n";
import type { MessageKey } from "../i18n";

/** How a game is played. A few lines, in the order a round happens, so someone
 * handed a phone mid-party can read it in the time it takes to press Start.
 *
 * Kept as keys rather than prose so each game owns its list, the list can be
 * reordered or trimmed without touching the markup, and both languages stay in
 * step. */
export function RulesCard({ rules }: { rules: MessageKey[] }) {
  const { t } = useT();

  return (
    <section className="rules-card">
      <h2>{t("rules.heading")}</h2>
      <ol className="rules-list">
        {rules.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ol>
    </section>
  );
}
