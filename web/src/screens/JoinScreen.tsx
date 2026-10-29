import { useState } from "react";
import { useT, type MessageKey } from "../i18n";
import type { Snapshot } from "../net/connection";

interface Props {
  snapshot: Snapshot;
  onCreate: (displayName: string) => void;
  onJoin: (code: string, displayName: string) => void;
}

// First screen: optionally pick a name, then either create a room or join one
// by code. Leaving the name empty is a normal way in — the server names the
// player "Guest 2" and the round plays the same. Nothing here enforces a name,
// so the only thing standing between someone and a game is the room code.
export function JoinScreen({ snapshot, onCreate, onJoin }: Props) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  const trimmedName = name.trim();

  function create() {
    setHint(null);
    onCreate(trimmedName);
  }

  function join() {
    if (!code.trim()) {
      setHint(t("join.codeRequired"));
      return;
    }
    setHint(null);
    onJoin(code.trim().toUpperCase(), trimmedName);
  }

  const error = snapshot.lastError
    ? t(errorKey(snapshot.lastError))
    : null;

  return (
    <main className="screen">
      <h1>{t("join.heading")}</h1>

      <label className="field">
        <span>{t("join.nameLabel")}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("join.namePlaceholder")}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
        />
      </label>
      {/* Said once, under the field, rather than as a warning when they
          submit: being a guest is a choice, not a mistake. */}
      {!trimmedName && <p className="status">{t("join.nameOptional")}</p>}

      <button className="primary" onClick={create}>
        {t("join.createButton")}
      </button>

      <div className="divider">{t("join.or")}</div>

      <label className="field">
        <span>{t("join.codeLabel")}</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("join.codePlaceholder")}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={8}
          enterKeyHint="go"
          onKeyDown={(e) => {
            if (e.key === "Enter") join();
          }}
        />
      </label>

      <button className="secondary" onClick={join}>
        {t("join.joinButton")}
      </button>

      {(hint || error) && <p className="hint">{hint ?? error}</p>}
    </main>
  );
}

// Map a server error code to a message key, falling back to a generic one.
function errorKey(code: string): MessageKey {
  return code === "room_not_found" ? "error.room_not_found" : "error.generic";
}
