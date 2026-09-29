import { useT } from "../../i18n";
import type { StealPrompt } from "./gen/imposter_pb";
import type { GameViewProps } from "../registry";
import { nameFor } from "./nameFor";

interface Props extends GameViewProps {
  prompt: StealPrompt | null;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}

// The vote caught the imposter. Only they get an input, for one blind guess
// at the word; everyone else just watches and waits.
export function StealView({ prompt, value, onChange, onSubmit, selfId, players }: Props) {
  const { t } = useT();

  if (!prompt) {
    return (
      <main className="screen">
        <p className="status">{t("imposter.dealing")}</p>
      </main>
    );
  }

  const isImposter = prompt.imposterId === selfId;

  return (
    <main className="screen">
      <h1>{t("imposter.stealHeading")}</h1>

      <section className="role-card role-imposter">
        <p className="role-hint">
          {isImposter
            ? t("imposter.stealHintImposter")
            : t("imposter.stealHintOther", { who: nameFor(players, prompt.imposterId) })}
        </p>
      </section>

      {isImposter ? (
        <section>
          <label className="field">
            <span>{t("imposter.stealGuessLabel")}</span>
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={t("imposter.stealGuessPlaceholder")}
              enterKeyHint="send"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") onSubmit();
              }}
            />
          </label>
          <button className="primary" onClick={onSubmit}>
            {t("imposter.stealSubmit")}
          </button>
        </section>
      ) : (
        <p className="status">
          {t("imposter.stealWaiting", { who: nameFor(players, prompt.imposterId) })}
        </p>
      )}
    </main>
  );
}
