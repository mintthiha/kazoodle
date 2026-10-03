import { useState } from "react";
import { useT } from "../i18n";
import type { RoomState } from "../net/connection";
import type { EchoLine } from "../net/connection";
import { CATEGORY_OPTIONS } from "../games/imposter/categories";
import { decodeStartOptions } from "../games/imposter/messages";

// IMPOSTER_MIN_PLAYERS mirrors the server's minPlayers for Imposter. If they
// drift, the server still rejects the start — this only gates the button.
const IMPOSTER_MIN_PLAYERS = 3;

interface Props {
  room: RoomState;
  lastEcho: EchoLine | null;
  isHost: boolean;
  onStartGame: (hintsEnabled: boolean, category: string) => void;
  onSetCategory: (hintsEnabled: boolean, category: string) => void;
  onEcho: (text: string) => void;
  onLeave: () => void;
}

// Second screen: the room's code, who is in it, a host-only "start game"
// control (category + imposter-hints), and a tiny echo box that proves a
// message round-trips.
//
// The host's category pick is a live choice, not just a start-time one: every
// change calls onSetCategory, which the app wires to SetGameOptions, so the
// whole lobby — not just the host — sees "Category: Food" update as the host
// changes their mind. See room.pendingOptions in net/connection.ts.
export function LobbyScreen({
  room,
  lastEcho,
  isHost,
  onStartGame,
  onSetCategory,
  onEcho,
  onLeave,
}: Props) {
  const { t } = useT();
  const [text, setText] = useState("");
  const [hintsEnabled, setHintsEnabled] = useState(false);
  const [category, setCategory] = useState("");
  const canStart = room.players.length >= IMPOSTER_MIN_PLAYERS;

  // Non-host players (and the host, on reconnect) read the live pick back out
  // of the room's broadcast pendingOptions instead of local state.
  const pending =
    room.pendingOptions && room.pendingOptions.gameId === "imposter"
      ? decodeStartOptions(room.pendingOptions.options)
      : null;

  function setAndBroadcast(nextHints: boolean, nextCategory: string) {
    setHintsEnabled(nextHints);
    setCategory(nextCategory);
    onSetCategory(nextHints, nextCategory);
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
            <select
              value={category}
              onChange={(e) => setAndBroadcast(hintsEnabled, e.target.value)}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-inline">
            <input
              type="checkbox"
              checked={hintsEnabled}
              onChange={(e) => setAndBroadcast(e.target.checked, category)}
            />
            <span>{t("lobby.hintsToggle")}</span>
          </label>
          <button
            className="primary"
            onClick={() => onStartGame(hintsEnabled, category)}
            disabled={!canStart}
          >
            {t("lobby.startImposter")}
          </button>
          {!canStart && (
            <p className="hint">{t("lobby.needPlayers", { min: IMPOSTER_MIN_PLAYERS })}</p>
          )}
        </section>
      ) : (
        pending && (
          <section>
            <p className="hint">
              {t("lobby.categoryChosen", {
                category: t(
                  CATEGORY_OPTIONS.find((o) => o.key === pending.category)?.labelKey ??
                    "imposter.category.any",
                ),
              })}
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
