import { useEffect, useState } from "react";
import { useT } from "../i18n";
import type { RoomState } from "../net/connection";
import type { EchoLine } from "../net/connection";
import { CATEGORY_OPTIONS } from "../games/imposter/categories";
import { CLUE_PASS_OPTIONS, CLUE_SECONDS_OPTIONS, ROUND_OPTIONS } from "../games/imposter/rounds";
import {
  DEFAULT_MATCH_OPTIONS,
  decodeStartOptions,
  type MatchOptions,
} from "../games/imposter/messages";

// IMPOSTER_MIN_PLAYERS mirrors the server's minPlayers for Imposter. If they
// drift, the server still rejects the start — this only gates the button.
const IMPOSTER_MIN_PLAYERS = 3;

type CopyState = "idle" | "copied" | "failed";

interface Props {
  room: RoomState;
  lastEcho: EchoLine | null;
  isHost: boolean;
  onStartGame: (opts: MatchOptions) => void;
  onSetOptions: (opts: MatchOptions) => void;
  onEcho: (text: string) => void;
  onLeave: () => void;
}

// Second screen: the room's code, who is in it, the host-only match setup
// (category, match length, imposter-hints) and start control, and a tiny echo
// box that proves a message round-trips.
//
// The host's picks are live choices, not just start-time ones: every change
// calls onSetOptions, which the app wires to SetGameOptions, so the whole
// lobby — not just the host — sees "Category: Food" update as the host changes
// their mind. See room.pendingOptions in net/connection.ts.
export function LobbyScreen({
  room,
  lastEcho,
  isHost,
  onStartGame,
  onSetOptions,
  onEcho,
  onLeave,
}: Props) {
  const { t } = useT();
  const [text, setText] = useState("");
  const [opts, setOpts] = useState<MatchOptions>(DEFAULT_MATCH_OPTIONS);
  // Result of the last "copy code" press. `n` increments on every press so
  // pressing twice restarts the confirmation timer even when the outcome is
  // the same both times (React skips a re-render if the value is unchanged).
  const [copy, setCopy] = useState<{ state: CopyState; n: number }>({ state: "idle", n: 0 });
  const canStart = room.players.length >= IMPOSTER_MIN_PLAYERS;

  // Clear the copy confirmation a couple of seconds after it appears. The
  // returned function is the cleanup: React runs it before the next effect and
  // on unmount, so leaving the lobby mid-countdown cannot fire setCopy on a
  // screen that is gone.
  useEffect(() => {
    if (copy.state === "idle") return;
    const timer = setTimeout(() => setCopy({ state: "idle", n: copy.n }), 2000);
    return () => clearTimeout(timer);
  }, [copy.state, copy.n]);

  // Non-host players (and the host, on reconnect) read the live pick back out
  // of the room's broadcast pendingOptions instead of local state.
  const pending =
    room.pendingOptions && room.pendingOptions.gameId === "imposter"
      ? decodeStartOptions(room.pendingOptions.options)
      : null;

  // One setter for all three options: a partial update is merged into what the
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

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onEcho(trimmed);
    setText("");
  }

  return (
    <main className="screen">
      <h1>{t("lobby.heading")}</h1>

      <section className="room-code">
        <span className="label">{t("lobby.roomCode")}</span>
        <span className="code">{room.code}</span>
        <button className="secondary copy-code" onClick={copyCode}>
          {t("lobby.copyCode")}
        </button>
        {/* aria-live so a screen reader announces the result of a press that
            otherwise changes nothing on screen. */}
        <p className="copy-status" data-state={copy.state} aria-live="polite">
          {copy.state === "copied" && t("lobby.codeCopied")}
          {copy.state === "failed" && t("lobby.copyFailed")}
        </p>
      </section>

      <section>
        <h2>
          {t("lobby.players")} ({room.players.length})
        </h2>
        <ul className="players">
          {room.players.map((p) => (
            <li key={p.id}>
              {p.displayName}
              {p.id === room.selfId && <span className="you"> ({t("lobby.you")})</span>}
            </li>
          ))}
        </ul>
      </section>

      {isHost ? (
        <section>
          <label className="field">
            <span>{t("lobby.categoryLabel")}</span>
            <select value={opts.category} onChange={(e) => pick({ category: e.target.value })}>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("lobby.cluePassesLabel")}</span>
            <select
              value={opts.cluePasses}
              onChange={(e) => pick({ cluePasses: Number(e.target.value) })}
            >
              {CLUE_PASS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("lobby.clueSecondsLabel")}</span>
            <select
              value={opts.clueSeconds}
              onChange={(e) => pick({ clueSeconds: Number(e.target.value) })}
            >
              {CLUE_SECONDS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("lobby.roundsLabel")}</span>
            <select
              value={opts.rounds}
              onChange={(e) => pick({ rounds: Number(e.target.value) })}
            >
              {ROUND_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {t("lobby.roundsOption", { n })}
                </option>
              ))}
            </select>
          </label>
          <label className="field-inline">
            <input
              type="checkbox"
              checked={opts.hintsEnabled}
              onChange={(e) => pick({ hintsEnabled: e.target.checked })}
            />
            <span>{t("lobby.hintsToggle")}</span>
          </label>
          <button className="primary" onClick={() => onStartGame(opts)} disabled={!canStart}>
            {t("lobby.startImposter")}
          </button>
          {!canStart && (
            <p className="hint">{t("lobby.needPlayers", { min: IMPOSTER_MIN_PLAYERS })}</p>
          )}
        </section>
      ) : (
        pending && (
          <section>
            <p className="status">
              {t("lobby.categoryChosen", {
                category: t(
                  CATEGORY_OPTIONS.find((o) => o.key === pending.category)?.labelKey ??
                    "imposter.category.any",
                ),
              })}
            </p>
            <p className="status">{t("lobby.roundsChosen", { n: pending.rounds })}</p>
            <p className="status">
              {t(
                CLUE_PASS_OPTIONS.find((o) => o.value === pending.cluePasses)?.labelKey ??
                  "lobby.cluePassesTwo",
              )}
            </p>
            <p className="status">
              {t(
                CLUE_SECONDS_OPTIONS.find((o) => o.value === pending.clueSeconds)?.labelKey ??
                  "lobby.clueSecondsOff",
              )}
            </p>
          </section>
        )
      )}

      <section>
        <label className="field">
          <span>{t("lobby.echoLabel")}</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("lobby.echoPlaceholder")}
            enterKeyHint="send"
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
        </label>
        <button className="secondary" onClick={send}>
          {t("lobby.echoButton")}
        </button>
        <p className="echo-line">
          {lastEcho
            ? t("lobby.echoLast", {
                who:
                  lastEcho.fromPlayerId === room.selfId
                    ? t("lobby.echoFromYou")
                    : nameFor(room, lastEcho.fromPlayerId, t("lobby.echoFromOther")),
                text: lastEcho.text,
              })
            : t("lobby.echoNone")}
        </p>
      </section>

      <button className="danger" onClick={onLeave}>
        {t("lobby.leaveButton")}
      </button>
    </main>
  );
}

function nameFor(room: RoomState, id: string, fallback: string): string {
  return room.players.find((p) => p.id === id)?.displayName ?? fallback;
}
