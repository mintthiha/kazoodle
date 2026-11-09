import { useT, type MessageKey } from "../../../i18n";
import { BackNav } from "../../../screens/BackNav";
import { RulesCard } from "../../../screens/RulesCard";
import { Segmented } from "../../../screens/Segmented";
import { SeatEditor } from "../../onephone/SeatEditor";
import { duplicateSeats, resolveNames } from "../../onephone/seats";
import { SEAT_BOUNDS, type AnswerMode, type LocalSettings, type SecretSource } from "./localGame";
import type { LocalSetup } from "./saved";

interface Props {
  setup: LocalSetup;
  onChange: (setup: LocalSetup) => void;
  onStart: () => void;
  onExit: () => void;
}

/** The rules as this group will play them: only the line about answering changes. */
function rulesFor(answers: AnswerMode): MessageKey[] {
  return [
    "wl.rule.roles",
    "wl.rule.scale",
    answers === "spoken" ? "wl.rule.categorySpoken" : "wl.rule.category",
    "wl.rule.three",
    "wl.rule.scoring",
    "wl.rule.rotate",
  ];
}

// Who is playing and who picks the number. Everything else about a round is
// decided while playing it, so this is short on purpose.
export function SetupView({ setup, onChange, onStart, onExit }: Props) {
  const { t } = useT();
  const { names, settings } = setup;
  const clashes = duplicateSeats(resolveNames(names, (n) => t("local.playerN", { n })));

  function pick(change: Partial<LocalSettings>) {
    onChange({ ...setup, settings: { ...settings, ...change } });
  }

  return (
    <>
      <BackNav onExit={onExit} />
      <main className="screen local-setup">
        <h1>{t("game.wavelength.name")}</h1>

        <SeatEditor names={names} bounds={SEAT_BOUNDS} onChange={(next) => onChange({ ...setup, names: next })} />

        <section className="setup">
          <div>
            <Segmented<AnswerMode>
              name="answers"
              legend={t("wl.answersLabel")}
              value={settings.answers}
              options={[
                { value: "spoken", label: t("wl.answersSpoken") },
                { value: "typed", label: t("wl.answersTyped") },
              ]}
              onChange={(answers) => pick({ answers })}
            />
            <p className="status local-help">
              {settings.answers === "spoken" ? t("wl.answersSpokenHelp") : t("wl.answersTypedHelp")}
            </p>
          </div>
          <div>
            <Segmented<SecretSource>
              name="secret"
              legend={t("wl.secretLabel")}
              value={settings.secret}
              options={[
                { value: "random", label: t("wl.secretRandom") },
                { value: "chosen", label: t("wl.secretChosen") },
              ]}
              onChange={(secret) => pick({ secret })}
            />
            <p className="status local-help">
              {settings.secret === "random" ? t("wl.secretRandomHelp") : t("wl.secretChosenHelp")}
            </p>
          </div>
        </section>

        <RulesCard rules={rulesFor(settings.answers)} />

        <div className="dock">
          {clashes.size > 0 && <p className="hint">{t("wl.duplicateName")}</p>}
          <button className="primary" disabled={clashes.size > 0} onClick={onStart}>
            {t("local.startPlaying")}
          </button>
        </div>
      </main>
    </>
  );
}
