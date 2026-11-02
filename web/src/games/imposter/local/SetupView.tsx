import { useT } from "../../../i18n";
import { Avatar } from "../../../players/Avatar";
import { BackNav } from "../../../screens/BackNav";
import { Segmented } from "../../../screens/Segmented";
import { CATEGORY_OPTIONS } from "../categories";
import { CLUE_PASS_OPTIONS } from "../rounds";
import {
  AUTO_SECONDS_OPTIONS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  duplicateSeats,
  resizeNames,
  resolveNames,
  type AdvanceMode,
  type LocalSettings,
} from "./localGame";
import type { LocalSetup } from "./saved";
import { makeSeatHue } from "./seatHue";

interface Props {
  setup: LocalSetup;
  onChange: (setup: LocalSetup) => void;
  onStart: () => void;
  onExit: () => void;
}

// Who is playing and how. A blank name is fine and becomes "Player 3", so the
// shortest path to a game is one tap.
export function SetupView({ setup, onChange, onStart, onExit }: Props) {
  const { t } = useT();
  const { names, settings } = setup;

  const resolved = resolveNames(names, (n) => t("local.playerN", { n }));
  const clashes = duplicateSeats(resolved);
  const hue = makeSeatHue(names.length);

  function pick(change: Partial<LocalSettings>) {
    onChange({ ...setup, settings: { ...settings, ...change } });
  }

  function setCount(count: number) {
    onChange({ ...setup, names: resizeNames(names, count) });
  }

  function rename(seat: number, name: string) {
    onChange({ ...setup, names: names.map((old, i) => (i === seat ? name : old)) });
  }

  return (
    <>
      <BackNav onExit={onExit} />
      <main className="screen local-setup">
        <h1>{t("local.setupHeading")}</h1>

        <section>
          <div className="seat-head">
            <h2>{t("lobby.players")}</h2>
            <div className="stepper">
              <button
                className="secondary"
                aria-label={t("local.removePlayer")}
                disabled={names.length <= MIN_PLAYERS}
                onClick={() => setCount(names.length - 1)}
              >
                −
              </button>
              <output className="stepper-count num" aria-live="polite">
                {names.length}
              </output>
              <button
                className="secondary"
                aria-label={t("local.addPlayer")}
                disabled={names.length >= MAX_PLAYERS}
                onClick={() => setCount(names.length + 1)}
              >
                +
              </button>
            </div>
          </div>

          <ol className="seat-list">
            {names.map((name, seat) => (
              <li key={seat} className="seat-row" data-clash={clashes.has(seat)}>
                <Avatar name={resolved[seat]} hue={hue(seat)} />
                <input
                  value={name}
                  onChange={(e) => rename(seat, e.target.value)}
                  placeholder={t("local.playerN", { n: seat + 1 })}
                  aria-label={t("local.nameLabel", { n: seat + 1 })}
                  aria-invalid={clashes.has(seat)}
                  autoComplete="off"
                  autoCapitalize="words"
                  maxLength={MAX_NAME_LENGTH}
                  enterKeyHint="next"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    // Typing a whole table's names one-handed: Enter moves down
                    // the list, so nobody has to aim for the next box.
                    const next = e.currentTarget.closest("li")?.nextElementSibling;
                    next?.querySelector("input")?.focus();
                  }}
                />
              </li>
            ))}
          </ol>
        </section>

        <section className="setup">
          <h2>{t("lobby.setupHeading")}</h2>
          <Segmented
            name="category"
            legend={t("lobby.categoryLabel")}
            wrap
            value={settings.category}
            options={CATEGORY_OPTIONS.map((o) => ({ value: o.key, label: t(o.labelKey) }))}
            onChange={(category) => pick({ category })}
          />
          <label className="switch-row">
            <span>{t("lobby.hintsToggle")}</span>
            <input
              type="checkbox"
              role="switch"
              className="visually-hidden"
              checked={settings.hintsEnabled}
              onChange={(e) => pick({ hintsEnabled: e.target.checked })}
            />
            <span className="switch" aria-hidden="true" />
          </label>
          <div>
            <Segmented<AdvanceMode>
              name="advance"
              legend={t("local.advanceLabel")}
              value={settings.advance}
              options={[
                { value: "manual", label: t("local.advanceManual") },
                { value: "auto", label: t("local.advanceAuto") },
              ]}
              onChange={(advance) => pick({ advance })}
            />
            <p className="status local-help">
              {settings.advance === "manual"
                ? t("local.advanceManualHelp")
                : t("local.advanceAutoHelp")}
            </p>
          </div>
          {settings.advance === "auto" && (
            <>
              <Segmented
                name="clue-passes"
                legend={t("lobby.cluePassesLabel")}
                value={settings.cluePasses}
                options={CLUE_PASS_OPTIONS.map((o) => ({
                  value: o.value,
                  label: String(o.value),
                }))}
                onChange={(cluePasses) => pick({ cluePasses })}
              />
              <Segmented
                name="clue-seconds"
                legend={t("lobby.clueSecondsLabel")}
                value={settings.clueSeconds}
                options={AUTO_SECONDS_OPTIONS.map((n) => ({
                  value: n as number,
                  label: t("lobby.clueSecondsShort", { n }),
                }))}
                onChange={(clueSeconds) => pick({ clueSeconds })}
              />
            </>
          )}
        </section>

        <div className="dock">
          {clashes.size > 0 && <p className="hint">{t("local.duplicateName")}</p>}
          <button className="primary" disabled={clashes.size > 0} onClick={onStart}>
            {t("local.deal")}
          </button>
        </div>
      </main>
    </>
  );
}
