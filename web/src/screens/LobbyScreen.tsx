import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { displayNameOf } from "../displayName";
import { errorKey } from "../errorKey";
import { Avatar } from "../players/Avatar";
import { makeHueFor } from "../players/hues";
import { ChatPanel } from "./ChatPanel";
import { Segmented } from "./Segmented";
import { RulesCard } from "./RulesCard";
import { IMPOSTER_RULES } from "../games/imposter/rules";
import type { RoomState } from "../net/connection";
import type { EchoLine } from "../net/connection";
import { CATEGORY_OPTIONS } from "../games/imposter/categories";
import {
  CLUE_PASS_OPTIONS,
  CLUE_SECONDS_OPTIONS,
  ROUND_OPTIONS,
  TWO_IMPOSTER_MIN_PLAYERS,
} from "../games/imposter/rounds";
import {
  DEFAULT_MATCH_OPTIONS,
  decodeStartOptions,
  type MatchOptions,
} from "../games/imposter/messages";
import "./lobby.css";

// IMPOSTER_MIN_PLAYERS mirrors the server's minPlayers for Imposter. If they
// drift, the server still rejects the start — this only gates the button.
const IMPOSTER_MIN_PLAYERS = 3;

type CopyState = "idle" | "copied" | "failed";

interface Props {
  room: RoomState;
  lastEcho: EchoLine | null;
  /** The last server error code, or null. Shown above the Start button: a
   * refusal the player cannot see is how a button comes to look broken. */
  lastError: string | null;
  isHost: boolean;
  onStartGame: (opts: MatchOptions) => void;
  onSetOptions: (opts: MatchOptions) => void;
  onEcho: (text: string) => void;
  onLeave: () => void;
}

// Second screen: the room's code, who is in it, the host-only match setup
// (category, match length, imposter-hints) and start control, and the chat.
//
// The host's picks are live choices, not just start-time ones: every change
// calls onSetOptions, which the app wires to SetGameOptions, so the whole
// lobby — not just the host — sees "Category: Food" update as the host changes
// their mind. See room.pendingOptions in net/connection.ts.
export function LobbyScreen({
  room,
  lastEcho,
  lastError,
  isHost,
  onStartGame,
  onSetOptions,
  onEcho,
  onLeave,
}: Props) {
  const { t } = useT();
  const [opts, setOpts] = useState<MatchOptions>(DEFAULT_MATCH_OPTIONS);
  // Result of the last "copy code" press. `n` increments on every press so
  // pressing twice restarts the confirmation timer even when the outcome is
  // the same both times (React skips a re-render if the value is unchanged).
  const [copy, setCopy] = useState<{ state: CopyState; n: number }>({ state: "idle", n: 0 });
  // Only connected players get dealt in, so a held seat does not count towards
  // starting. Otherwise the button could promise a game the server will refuse.
  const onlineCount = room.players.length - room.offline.length;
  const canStart = onlineCount >= IMPOSTER_MIN_PLAYERS;
  const bigTable = onlineCount >= TWO_IMPOSTER_MIN_PLAYERS;
  const hueFor = makeHueFor(room.players, room.departed);
  const openSeats = Math.max(0, IMPOSTER_MIN_PLAYERS - room.players.length);

  // Clear the copy confirmation a couple of seconds after it appears. The
  // returned function is the cleanup: React runs it before the next effect and
  // on unmount, so leaving the lobby mid-countdown cannot fire setCopy on a
  // screen that is gone.
  useEffect(() => {
    if (copy.state === "idle") return;
    const timer = setTimeout(() => setCopy({ state: "idle", n: copy.n }), 2000);
    return () => clearTimeout(timer);
  }, [copy.state, copy.n]);

  // Non-host players read the live pick back out of the room's broadcast
  // pendingOptions. Until the host touches anything nothing has been broadcast,
  // and what will be played is exactly the defaults, so that is what they see.
  const pending =
    room.pendingOptions && room.pendingOptions.gameId === "imposter"
      ? decodeStartOptions(room.pendingOptions.options)
      : DEFAULT_MATCH_OPTIONS;

  const host = room.players.find((p) => p.id === room.hostId);

  // One setter for all the options: a partial update is merged into what the
  // host already picked, then the whole set goes out, since SetGameOptions
  // carries the options as one payload rather than a patch.
  function pick(change: Partial<MatchOptions>) {
    const next = { ...opts, ...change };
    setOpts(next);
    onSetOptions(next);
  }

  async function copyCode() {
    try {
      // navigator.clipboard only exists in a secure context, and a phone
      // reaching the dev server over plain http on the LAN is not one — so a
      // missing clipboard is a normal case here, not an edge case.
      await navigator.clipboard.writeText(room.code);
      setCopy((c) => ({ state: "copied", n: c.n + 1 }));
    } catch {
      setCopy((c) => ({ state: "failed", n: c.n + 1 }));
    }
  }

  return (
    <main className="screen lobby">
      <header className="lobby-head">
        <h1>{t("lobby.heading")}</h1>
        <button className="danger" onClick={onLeave}>
          {t("lobby.leaveButton")}
        </button>
      </header>

      <div className="lobby-grid">
        <div className="lobby-col">
          {/* The code is what gets read aloud across a room, so it is the
              biggest thing on the screen. */}
          <section className="room-code">
            <div className="room-code-row">
              <div>
                <span className="room-code-label">{t("lobby.roomCode")}</span>
                <span className="room-code-value">{room.code}</span>
              </div>
              <button className="secondary copy-code" onClick={copyCode}>
                {copy.state === "copied" ? t("lobby.codeCopied") : t("lobby.copyCode")}
              </button>
            </div>
            {/* aria-live so a screen reader announces the result of a press. */}
            <p className="copy-status" aria-live="polite">
              {copy.state === "failed" && t("lobby.copyFailed")}
            </p>
          </section>

          <section>
            <h2>
              {t("lobby.players")} <span className="num">({room.players.length})</span>
            </h2>
            <ul className="roster">
              {room.players.map((p) => {
                const name = displayNameOf(p.displayName, t);
                return (
                  <li key={p.id} className="roster-row">
                    <Avatar name={name} hue={hueFor(p.id)} />
                    <span className="roster-name">
                      {name}
                      {p.id === room.selfId && <span className="you"> ({t("lobby.you")})</span>}
                    </span>
                    {room.offline.includes(p.id) && (
                      <span className="pill pill-offline">{t("lobby.offline")}</span>
                    )}
                    {p.id === room.hostId && <span className="pill">{t("lobby.host")}</span>}
                  </li>
                );
              })}
              {/* Seats still to fill before a game can start, drawn empty so a
                  disabled Start button has a visible reason. */}
              {Array.from({ length: openSeats }, (_, i) => (
                <li key={i} className="roster-row roster-seat">
                  <span className="avatar-empty" aria-hidden="true" />
                  <span>{t("lobby.emptySeat")}</span>
                </li>
              ))}
            </ul>
          </section>

          <RulesCard rules={IMPOSTER_RULES} />
        </div>

        <div className="lobby-col">
          <section className="setup">
            <h2>{t("lobby.setupHeading")}</h2>
            {isHost ? (
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
                    label:
                      o.value === 0
                        ? t("lobby.clueSecondsOffShort")
                        : t("lobby.clueSecondsShort", { n: o.value }),
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
            ) : (
              <dl className="setup-readout">
                <div>
                  <dt>{t("lobby.categoryLabel")}</dt>
                  <dd>
                    {t(
                      CATEGORY_OPTIONS.find((o) => o.key === pending.category)?.labelKey ??
                        "imposter.category.any",
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t("lobby.roundsLabel")}</dt>
                  <dd>{t("lobby.roundsOption", { n: pending.rounds })}</dd>
                </div>
                <div>
                  <dt>{t("lobby.cluePassesLabel")}</dt>
                  <dd>
                    {t(
                      CLUE_PASS_OPTIONS.find((o) => o.value === pending.cluePasses)?.labelKey ??
                        "lobby.cluePassesTwo",
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t("lobby.clueSecondsLabel")}</dt>
                  <dd>
                    {t(
                      CLUE_SECONDS_OPTIONS.find((o) => o.value === pending.clueSeconds)?.labelKey ??
                        "lobby.clueSecondsOff",
                    )}
                  </dd>
                </div>
                {bigTable && (
                  <div>
                    <dt>{t("lobby.impostersLabel")}</dt>
                    <dd>{t(pending.imposters === 1 ? "lobby.impostersOne" : "lobby.impostersTwo")}</dd>
                  </div>
                )}
              </dl>
            )}
          </section>

          <ChatPanel room={room} lastEcho={lastEcho} onSend={onEcho} />
        </div>
      </div>

      <div className="dock lobby-dock">
        {errorKey(lastError) && <p className="hint">{t(errorKey(lastError)!)}</p>}
        {isHost ? (
          <>
            {!canStart && (
              <p className="status">{t("lobby.needPlayers", { min: IMPOSTER_MIN_PLAYERS })}</p>
            )}
            <button className="primary" onClick={() => onStartGame(opts)} disabled={!canStart}>
              {t("lobby.startImposter")}
            </button>
          </>
        ) : (
          <p className="status">
            {t("lobby.waitingForHost", {
              who: host ? displayNameOf(host.displayName, t) : t("lobby.host"),
            })}
          </p>
        )}
      </div>
    </main>
  );
}
