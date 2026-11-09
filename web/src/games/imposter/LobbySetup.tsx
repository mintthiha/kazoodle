import { useT } from "../../i18n";
import { Segmented } from "../../screens/Segmented";
import type { LobbySetupProps } from "../registry";
import { CATEGORY_OPTIONS } from "./categories";
import { CLUE_PASS_OPTIONS, CLUE_SECONDS_OPTIONS, ROUND_OPTIONS, TWO_IMPOSTER_MIN_PLAYERS } from "./rounds";
import { decodeStartOptions, encodeStartOptions, type MatchOptions } from "./messages";

// Imposter's match setup in the lobby: the host's controls, or for everyone else
// a read-out of what the host picked. The options travel as proto3-JSON, so the
// lobby itself never needs to know what Imposter's options are.
export function ImposterLobbySetup({ value, onChange, onlineCount }: LobbySetupProps) {
  const { t } = useT();
  const opts = decodeStartOptions(value);
  const bigTable = onlineCount >= TWO_IMPOSTER_MIN_PLAYERS;

  // A partial update merged into what the host already picked, then sent whole,
  // since SetGameOptions carries the options as one payload rather than a patch.
  function pick(change: Partial<MatchOptions>) {
    onChange?.(encodeStartOptions({ ...opts, ...change }));
  }

  if (!onChange) {
    return (
      <dl className="setup-readout">
        <div>
          <dt>{t("lobby.categoryLabel")}</dt>
          <dd>
            {t(CATEGORY_OPTIONS.find((o) => o.key === opts.category)?.labelKey ?? "imposter.category.any")}
          </dd>
        </div>
        <div>
          <dt>{t("lobby.roundsLabel")}</dt>
          <dd>{t("lobby.roundsOption", { n: opts.rounds })}</dd>
        </div>
        <div>
          <dt>{t("lobby.cluePassesLabel")}</dt>
          <dd>
            {t(CLUE_PASS_OPTIONS.find((o) => o.value === opts.cluePasses)?.labelKey ?? "lobby.cluePassesTwo")}
          </dd>
        </div>
        <div>
          <dt>{t("lobby.clueSecondsLabel")}</dt>
          <dd>
            {t(
              CLUE_SECONDS_OPTIONS.find((o) => o.value === opts.clueSeconds)?.labelKey ?? "lobby.clueSecondsOff",
            )}
          </dd>
        </div>
        {bigTable && (
          <div>
            <dt>{t("lobby.impostersLabel")}</dt>
            <dd>{t(opts.imposters === 1 ? "lobby.impostersOne" : "lobby.impostersTwo")}</dd>
          </div>
        )}
      </dl>
    );
  }

  return (
    <>
      <Segmented
        name="category"
        legend={t("lobby.categoryLabel")}
        wrap
        value={opts.category}
        options={CATEGORY_OPTIONS.map((o) => ({ value: o.key, label: t(o.labelKey) }))}
        onChange={(category) => pick({ category })}
      />
      <Segmented
        name="rounds"
        legend={t("lobby.roundsLabel")}
        value={opts.rounds}
        options={ROUND_OPTIONS.map((n) => ({
          value: n as number,
          label: t("lobby.roundsOption", { n }),
        }))}
        onChange={(rounds) => pick({ rounds })}
      />
      <Segmented
        name="clue-passes"
        legend={t("lobby.cluePassesLabel")}
        value={opts.cluePasses}
        options={CLUE_PASS_OPTIONS.map((o) => ({
          value: o.value,
          label: String(o.value),
        }))}
        onChange={(cluePasses) => pick({ cluePasses })}
      />
      <Segmented
        name="clue-seconds"
        legend={t("lobby.clueSecondsLabel")}
        value={opts.clueSeconds}
        options={CLUE_SECONDS_OPTIONS.map((o) => ({
          value: o.value,
          label: o.value === 0 ? t("lobby.clueSecondsOffShort") : t("lobby.clueSecondsShort", { n: o.value }),
        }))}
        onChange={(clueSeconds) => pick({ clueSeconds })}
      />
      {bigTable && (
        <Segmented
          name="imposters"
          legend={t("lobby.impostersLabel")}
          // Zero is "the server's default", which is two.
          value={opts.imposters || 2}
          options={[
            { value: 1, label: "1" },
            { value: 2, label: "2" },
          ]}
          onChange={(imposters) => pick({ imposters })}
        />
      )}
      <label className="switch-row">
        <span>{t("lobby.hintsToggle")}</span>
        <input
          type="checkbox"
          role="switch"
          className="visually-hidden"
          checked={opts.hintsEnabled}
          onChange={(e) => pick({ hintsEnabled: e.target.checked })}
        />
        <span className="switch" aria-hidden="true" />
      </label>
    </>
  );
}
