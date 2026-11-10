import { useT } from "../../i18n";
import { Segmented } from "../../screens/Segmented";
import type { LobbySetupProps } from "../registry";
import { QUESTION_COUNTS, decodeStartOptions, encodeStartOptions, type QuestionCount } from "./messages";

/** Roughly how long a match of n questions takes: about 85 seconds a question,
 * more for creative questions at a big table, less when everyone is quick. */
function minutesFor(n: number): number {
  return Math.round((n * 85) / 60);
}

// Fibblash's match setup in the lobby: just the length. The host gets the
// control; everyone else a read-out of the host's pick.
export function FibblashLobbySetup({ value, onChange }: LobbySetupProps) {
  const { t } = useT();
  const opts = decodeStartOptions(value);
  const help = <p className="status local-help">{t("fb.questionsHelp", { min: minutesFor(opts.questions) })}</p>;

  if (!onChange) {
    return (
      <dl className="setup-readout">
        <div>
          <dt>{t("fb.questionsLabel")}</dt>
          <dd>{t("fb.questionsOption", { n: opts.questions })}</dd>
        </div>
      </dl>
    );
  }

  return (
    <div>
      <Segmented<QuestionCount>
        name="questions"
        legend={t("fb.questionsLabel")}
        value={opts.questions}
        options={QUESTION_COUNTS.map((n) => ({ value: n, label: t("fb.questionsOption", { n }) }))}
        onChange={(questions) => onChange(encodeStartOptions({ questions }))}
      />
      {help}
    </div>
  );
}
