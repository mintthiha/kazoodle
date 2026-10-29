import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import type { EchoLine, RoomState } from "../net/connection";
import { displayNameOf } from "../displayName";

interface Props {
  room: RoomState;
  lastEcho: EchoLine | null;
  onSend: (text: string) => void;
}

/** How many messages are kept on screen. The server keeps no log — this is a
 * per-device scrollback that starts empty whenever the screen mounts — so the
 * cap is only about not growing without bound in a long session. */
const MAX_LINES = 50;

interface Line {
  id: number;
  fromPlayerId: string;
  text: string;
}

// The room's chat, kept in a panel that is closed by default and scrolls
// inside itself when open.
//
// It used to sit expanded between the game options and the Leave button, which
// put a growing list in the middle of the controls: the longer the chat, the
// further the thing you actually came to press. A panel that opens over its
// own fixed height means the lobby is the same size whether anyone is talking
// or not.
export function ChatPanel({ room, lastEcho, onSend }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  // Unread count while the panel is closed, so a closed panel still tells you
  // something happened.
  const [unread, setUnread] = useState(0);
  const nextId = useRef(0);
  const listEnd = useRef<HTMLDivElement | null>(null);

  // Each echo arrives as a fresh object, so this runs once per message even
  // when someone sends the same word twice.
  useEffect(() => {
    if (!lastEcho) return;
    setLines((prev) => {
      const line = { id: nextId.current++, ...lastEcho };
      return [...prev, line].slice(-MAX_LINES);
    });
    setUnread((n) => n + 1);
  }, [lastEcho]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open, lines]);

  // Keep the newest message in view, but only when the panel is open —
  // scrolling a hidden element moves the page instead.
  useEffect(() => {
    if (open) listEnd.current?.scrollIntoView({ block: "nearest" });
  }, [open, lines]);

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  function nameOf(id: string): string {
    if (id === room.selfId) return t("lobby.echoFromYou");
    const player = room.players.find((p) => p.id === id);
    return player ? displayNameOf(player.displayName, t) : t("lobby.echoFromOther");
  }

  return (
    <section className="chat-panel">
      <button
        className="chat-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="chat-body"
      >
        {t("lobby.chatHeading")}
        {!open && unread > 0 && <span className="chat-unread">{unread}</span>}
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div id="chat-body">
          <div className="chat-log" role="log">
            {lines.length === 0 ? (
              <p className="status">{t("lobby.echoNone")}</p>
            ) : (
              lines.map((line) => (
                <p key={line.id} className="chat-line">
                  <strong>{nameOf(line.fromPlayerId)}:</strong> {line.text}
                </p>
              ))
            )}
            <div ref={listEnd} />
          </div>

          <label className="field">
            <span className="visually-hidden">{t("lobby.echoLabel")}</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("lobby.echoPlaceholder")}
              enterKeyHint="send"
              maxLength={200}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
          </label>
          <button className="secondary" onClick={send}>
            {t("lobby.echoButton")}
          </button>
        </div>
      )}
    </section>
  );
}
