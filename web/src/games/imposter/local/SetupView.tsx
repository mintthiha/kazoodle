import { useLayoutEffect, useRef, useState } from "react";
import { useT } from "../../../i18n";
import type { MessageKey } from "../../../i18n";
import { BackNav } from "../../../screens/BackNav";
import { RulesCard } from "../../../screens/RulesCard";
import { Segmented } from "../../../screens/Segmented";
import { SeatEditor } from "../../onephone/SeatEditor";
import { duplicateSeats, resolveNames } from "../../onephone/seats";
import { CATEGORY_OPTIONS } from "../categories";
import { CLUE_PASS_OPTIONS, TWO_IMPOSTER_MIN_PLAYERS } from "../rounds";
import { CategoryEditor } from "./CategoryEditor";
import { nextCustomKey, type CustomCategory } from "./customCategories";
import { AUTO_SECONDS_OPTIONS, SEAT_BOUNDS, type AdvanceMode, type LocalSettings } from "./localGame";
import type { LocalSetup } from "./saved";

interface Props {
  setup: LocalSetup;
  onChange: (setup: LocalSetup) => void;
  onStart: () => void;
  onExit: () => void;
}

/** This mode's rules differ from the online game's: clues are spoken, the table
 * picks one person together, and nobody keeps score. */
const LOCAL_RULES: MessageKey[] = [
  "imposter.rule.word",
  "local.rule.speak",
  "local.rule.accuse",
  "local.rule.steal",
  "local.rule.two",
];

// Who is playing and how. A blank name is fine and becomes "Player 3", so the
// shortest path to a game is one tap.
export function SetupView({ setup, onChange, onStart, onExit }: Props) {
  const { t } = useT();
  const { names, settings, customCategories } = setup;
  // Which category is open in the editor: "new", an existing one, or none.
  const [editing, setEditing] = useState<CustomCategory | "new" | null>(null);

  // The editor opens at its top, and closing it returns to the category picker
  // instead of leaving someone at a different place on a long form.
  const setupScroll = useRef(0);
  useLayoutEffect(() => {
    window.scrollTo(0, editing ? 0 : setupScroll.current);
  }, [editing]);

  function openEditor(target: CustomCategory | "new") {
    setupScroll.current = window.scrollY;
    setEditing(target);
  }

  const builtInCategories = CATEGORY_OPTIONS.map((o) => ({ value: o.key, label: t(o.labelKey) }));
  const selectedCustom = customCategories.find((c) => c.key === settings.category);

  const clashes = duplicateSeats(resolveNames(names, (n) => t("local.playerN", { n })));

  function pick(change: Partial<LocalSettings>) {
    onChange({ ...setup, settings: { ...settings, ...change } });
  }

  if (editing) {
    const existing = editing === "new" ? null : editing;
    const others = customCategories.filter((c) => c.key !== existing?.key);

    return (
      <CategoryEditor
        category={existing}
        takenNames={[...builtInCategories.map((o) => o.label), ...others.map((c) => c.name)]}
        onSave={(name, words) => {
          const key = existing?.key ?? nextCustomKey(customCategories);
          const saved = { key, name, words };
          onChange({
            ...setup,
            // Saving selects it: someone who just typed a list means to play it.
            settings: { ...settings, category: key },
            customCategories: existing
              ? customCategories.map((c) => (c.key === key ? saved : c))
              : [...customCategories, saved],
          });
          setEditing(null);
        }}
        onDelete={() => {
          // Only the selected category can be opened for editing, so the selection
          // always has to move off it here.
          onChange({ ...setup, settings: { ...settings, category: "" }, customCategories: others });
          setEditing(null);
        }}
        onBack={() => setEditing(null)}
      />
    );
  }

  return (
    <>
      <BackNav onExit={onExit} />
      <main className="screen local-setup">
        <h1>{t("local.setupHeading")}</h1>

        <SeatEditor
          names={names}
          bounds={SEAT_BOUNDS}
          onChange={(next) => onChange({ ...setup, names: next })}
        />

        <section className="setup">
          <h2>{t("lobby.setupHeading")}</h2>
          <div>
            <Segmented
              name="category"
              legend={t("lobby.categoryLabel")}
              wrap
              value={settings.category}
              options={[
                ...builtInCategories,
                ...customCategories.map((c) => ({ value: c.key, label: c.name })),
              ]}
              onChange={(category) => pick({ category })}
            />
            <div className="category-actions">
              <button className="secondary" onClick={() => openEditor("new")}>
                {t("local.customNew")}
              </button>
              {selectedCustom && (
                <button className="secondary" onClick={() => openEditor(selectedCustom)}>
                  {t("local.customEdit")}
                </button>
              )}
            </div>
          </div>
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
          {names.length >= TWO_IMPOSTER_MIN_PLAYERS && (
            <label className="switch-row">
              <span>{t("local.twoImpostersToggle")}</span>
              <input
                type="checkbox"
                role="switch"
                className="visually-hidden"
                checked={settings.twoImposters}
                onChange={(e) => pick({ twoImposters: e.target.checked })}
              />
              <span className="switch" aria-hidden="true" />
            </label>
          )}
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
              <label className="switch-row">
                <span>{t("local.soundToggle")}</span>
                <input
                  type="checkbox"
                  role="switch"
                  className="visually-hidden"
                  checked={settings.sound}
                  onChange={(e) => pick({ sound: e.target.checked })}
                />
                <span className="switch" aria-hidden="true" />
              </label>
            </>
          )}
        </section>

        <RulesCard rules={LOCAL_RULES} />

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
