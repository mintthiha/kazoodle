import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { useConnection } from "../../net/useConnection";
import { makeHueFor } from "../../players/hues";
import { joinNames } from "../../players/joinNames";
import { makeNameFor } from "../../players/nameFor";
import type { GameViewProps } from "../registry";
import { decodeFibblashEvent } from "./messages";
import type { People } from "./parts/people";
import { fold, type View } from "./view";

const GAME_ID = "fibblash";

/** Everything the phone view and the main-screen view share: the folded view
 * of the match, how to name people, and how to send. */
export function useFibblash({ selfId, players, departed }: GameViewProps) {
  const { locale, t } = useT();
  const { snapshot, actions, onGameEvent } = useConnection();
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    // onGameEvent replays the events buffered before this effect ran, then
    // streams new ones; the returned cleanup unsubscribes on unmount. A
    // reconnecting phone gets the whole match replayed and folds it back up.
    return onGameEvent((payload) => {
      setView((v) => fold(v, decodeFibblashEvent(payload)));
    });
  }, [onGameEvent]);

  // A main screen is on the roster but is nobody, so it takes no colour.
  const people: People = {
    nameFor: makeNameFor(players, departed, t),
    hueFor: makeHueFor(
      players.filter((p) => !p.screen),
      departed,
    ),
    list: (names) => joinNames(names, locale),
    selfId,
  };

  function send(payload: string) {
    actions.clearError();
    actions.gameAction(GAME_ID, payload);
  }

  return { view, people, send, snapshot, actions };
}
