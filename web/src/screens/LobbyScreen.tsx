import { useState } from "react";
import { useT } from "../i18n";
import type { RoomState } from "../net/connection";
import type { EchoLine } from "../net/connection";

// IMPOSTER_MIN_PLAYERS mirrors the server's minPlayers for Imposter. If they
// drift, the server still rejects the start — this only gates the button.
const IMPOSTER_MIN_PLAYERS = 3;

interface Props {
  room: RoomState;
  lastEcho: EchoLine | null;
  isHost: boolean;
  onStartGame: () => void;
  onEcho: (text: string) => void;
  onLeave: () => void;
}

// Second screen: the room's code, who is in it, a host-only "start game"
// control, and a tiny echo box that proves a message round-trips.
export function LobbyScreen({ room, lastEcho, isHost, onStartGame, onEcho, onLeave }: Props) {
  const { t } = useT();
  const [text, setText] = useState("");
  const canStart = room.players.length >= IMPOSTER_MIN_PLAYERS;

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

      {isHost && (
        <section>
          <button className="primary" onClick={onStartGame} disabled={!canStart}>
            {t("lobby.startImposter")}
          </button>
          {!canStart && (
            <p className="hint">{t("lobby.needPlayers", { min: IMPOSTER_MIN_PLAYERS })}</p>
          )}
        </section>
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
