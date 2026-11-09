import { useT } from "../../i18n";
import { Segmented } from "../../screens/Segmented";
import type { LobbySetupProps } from "../registry";
import type { AnswerMode, SecretSource } from "./local/localGame";
import { decodeStartOptions, encodeStartOptions, type MatchOptions } from "./messages";

// Online Wavelength's match setup in the lobby: the same two choices as the
// one-phone setup, as host controls or as a read-out for everyone else.
export function WavelengthLobbySetup({ value, onChange }: LobbySetupProps) {
  const { t } = useT();
  const opts = decodeStartOptions(value);

  function pick(change: Partial<MatchOptions>) {
    onChange?.(encodeStartOptions({ ...opts, ...change }));
  }

  if (!onChange) {
    return (
      <dl className="setup-readout">
        <div>
          <dt>{t("wl.answersLabel")}</dt>
          <dd>{opts.answers === "spoken" ? t("wl.answersSpoken") : t("wl.answersTyped")}</dd>
        </div>
        <div>
          <dt>{t("wl.secretLabel")}</dt>
          <dd>{opts.secret === "chosen" ? t("wl.secretChosen") : t("wl.secretRandom")}</dd>
        </div>
      </dl>
    );
  }

  return (
    <>
      <div>
        <Segmented<AnswerMode>
          name="answers"
          legend={t("wl.answersLabel")}
          value={opts.answers}
          options={[
            { value: "spoken", label: t("wl.answersSpoken") },
            { value: "typed", label: t("wl.answersTyped") },
          ]}
          onChange={(answers) => pick({ answers })}
        />
        <p className="status local-help">
          {opts.answers === "spoken" ? t("wl.onlineSpokenHelp") : t("wl.onlineTypedHelp")}
        </p>
      </div>
      <div>
        <Segmented<SecretSource>
          name="secret"
          legend={t("wl.secretLabel")}
          value={opts.secret}
          options={[
            { value: "random", label: t("wl.secretRandom") },
            { value: "chosen", label: t("wl.secretChosen") },
          ]}
          onChange={(secret) => pick({ secret })}
        />
        <p className="status local-help">
          {opts.secret === "random" ? t("wl.secretRandomHelp") : t("wl.secretChosenHelp")}
        </p>
      </div>
    </>
  );
}

