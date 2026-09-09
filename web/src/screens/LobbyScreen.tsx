import { useState } from "react";
import { useT } from "../i18n";
import type { RoomState } from "../net/connection";
import type { EchoLine } from "../net/connection";

interface Props {
  room: RoomState;
  lastEcho: EchoLine | null;
  onEcho: (text: string) => void;
  onLeave: () => void;
}

// Second screen: the room's code, who is in it, and a tiny echo control to
// prove a message round-trips through the server.
export function LobbyScreen({ room, lastEcho, onEcho, onLeave }: Props) {
  const { t } = useT();
  const [text, setText] = useState("");

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
