import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { makeHueFor } from "../../players/hues";
import type { ClueEntry, StealPrompt } from "./gen/imposter_pb";
import type { GameViewProps } from "../registry";
import { makeNameFor } from "../../players/nameFor";
import { ClueLedger } from "./ClueLedger";
import { Countdown } from "./Countdown";
import { buildLedger } from "./ledger";
import { useCountdown } from "./useCountdown";

interface Props extends GameViewProps {
  prompt: StealPrompt | null;
  /** The round's clues, carried over from the vote. They are the only evidence
   * the imposter has, and the table wants to watch them be read. */
  clues: ClueEntry[];
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** Why the last guess was not accepted, if it was not. */
  error: MessageKey | null;
}

// The vote caught the imposter. Only they get an input, for one blind guess
// at the word; everyone else just watches and waits.
export function StealView({
  prompt,
  clues,
  value,
  onChange,
  onSubmit,
  error,
  selfId,
  players,
  departed,
}: Props) {
  const { t } = useT();

  const name = makeNameFor(players, departed, t);
  const hue = makeHueFor(players, departed);
  // Everyone sees this, not just the imposter: the table watching a clock run
  // down is most of what makes the steal worth having.
  const secondsLeft = useCountdown(prompt?.stealSeconds ?? 0, prompt?.imposterId ?? "");

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
      <section className="slip slip-imposter slip-static">
        <h1>{t("imposter.stealHeading")}</h1>
        <p className="slip-note">
          {isImposter
            ? t("imposter.stealHintImposter")
            : t("imposter.stealHintOther", { who: name(prompt.imposterId) })}
        </p>
      </section>

      {secondsLeft !== null && (
        <Countdown
          seconds={secondsLeft}
          total={prompt.stealSeconds}
          label={t("imposter.clueCountdown", { n: secondsLeft })}
        />
      )}

      <ClueLedger
        rows={buildLedger(players.map((p) => p.id), clues)}
        passes={0}
        selfId={selfId}
        name={name}
        hue={hue}
      />

      <div className="dock">
        {isImposter ? (
          <>
            {/* Above the box, where the phone keyboard cannot hide it. */}
            {error && <p className="hint">{t(error)}</p>}
            <label className="field">
              <span>{t("imposter.stealGuessLabel")}</span>
              <span className="entry-row">
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
                <button className="primary" onClick={onSubmit}>
                  {t("imposter.stealSubmit")}
                </button>
              </span>
            </label>
          </>
        ) : (
          <p className="status">{t("imposter.stealWaiting", { who: name(prompt.imposterId) })}</p>
        )}
      </div>
    </main>
  );
}
