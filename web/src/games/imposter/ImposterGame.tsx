import { useEffect, useState } from "react";
import { useConnection } from "../../net/useConnection";
import type { GameViewProps } from "../registry";
import { decodeImposterEvent, encodeMarkReady } from "./messages";
import type { RevealProgress, RoleAssignment } from "./gen/imposter_pb";
import { RoleView } from "./RoleView";

// Container for the Imposter game. Folds the game-event stream into local state
// and renders the current phase. This slice only has the reveal phase.
export function ImposterGame({ selfId, players }: GameViewProps) {
  const { actions, onGameEvent } = useConnection();
  const [role, setRole] = useState<RoleAssignment | null>(null);
  const [progress, setProgress] = useState<RevealProgress | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // onGameEvent replays events buffered before this effect ran, then streams
    // new ones. The cleanup unsubscribes when the game ends and we unmount.
    return onGameEvent((payload) => {
      const msg = decodeImposterEvent(payload);
      switch (msg.body.case) {
        case "roleAssignment":
          setRole(msg.body.value);
          break;
        case "revealProgress":
          setProgress(msg.body.value);
          break;
      }
    });
  }, [onGameEvent]);

  function confirm() {
    setReady(true);
    actions.gameAction("imposter", encodeMarkReady());
  }

  return (
    <RoleView
      selfId={selfId}
      players={players}
      role={role}
      progress={progress}
      ready={ready}
      onConfirm={confirm}
    />
  );
}
