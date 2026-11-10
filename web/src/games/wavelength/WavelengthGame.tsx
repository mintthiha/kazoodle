import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../../i18n";
import { useConnection } from "../../net/useConnection";
import { makeHueFor } from "../../players/hues";
import { makeNameFor } from "../../players/nameFor";
import { useWakeLock } from "../onephone/useWakeLock";
import type { GameViewProps } from "../registry";
import { AnswerForm } from "./AnswerForm";
import type { BoardCategory } from "./Board";
import { CategoryForm } from "./CategoryForm";
import type { Category } from "./gen/wavelength_pb";
import {
  decodeWavelengthEvent,
  encodeChooseSecret,
  encodeMakeGuess,
  encodePlayAgain,
  encodeReadyToGuess,
  encodeSetCategory,
  encodeSubmitAnswer,
} from "./messages";
import { joinNames } from "../../players/joinNames";
import { ResultShow } from "./ResultShow";
import { ChooseScreen } from "./online/ChooseScreen";
import { wlErrorKey } from "./online/errors";
import { GuessScreen } from "./online/GuessScreen";
import { NumberPeek } from "./online/NumberPeek";
import { TalkScreen } from "./online/TalkScreen";
import { WaitScreen } from "./online/WaitScreen";
import { fold, roleOf, type View } from "./online/view";
import "../../screens/lobby.css";
import "../onephone/onephone.css";
import "./wavelength.css";

const GAME_ID = "wavelength";

// Online Wavelength, a phone each. The server's messages are folded into one View
// (see online/view.ts), and this component only decides which screen that view
// and this player's role call for, and sends what the player does.
export function WavelengthGame({ selfId, players, departed }: GameViewProps) {
  const { locale, t } = useT();
  const { snapshot, actions, onGameEvent } = useConnection();
  const [view, setView] = useState<View | null>(null);
  // Which category this phone last sent an answer for, as "round-category" so
  // category 1 of the next round is not mistaken for this one. The server's
  // progress list confirms the answer a moment later; until then this keeps the
  // form from flashing back up.
  const [answeredFor, setAnsweredFor] = useState("");

  useEffect(() => {
    // onGameEvent replays the events buffered before this effect ran, then
    // streams new ones; the returned cleanup unsubscribes on unmount. A
    // reconnecting phone gets the whole round replayed and folds it back up.
    return onGameEvent((payload) => {
      const msg = decodeWavelengthEvent(payload);
      setView((v) => fold(v, msg));
    });
  }, [onGameEvent]);

  // A spoken round leaves the phone face up for minutes while people talk.
  useWakeLock(view?.stage === "talk");

  if (!view) return null;

  const nameFor = makeNameFor(players, departed, t);
  const hueFor = makeHueFor(players, departed);
  const role = roleOf(view, selfId);
  const psychic = nameFor(view.start.psychicId);
  const board = toBoard(view.categories, nameFor, hueFor);
  const serverError = wlErrorKey(snapshot.lastError);

  function send(payload: string) {
    actions.clearError();
    actions.gameAction(GAME_ID, payload);
  }

  const number =
    role === "giver" && view.secret > 0 ? <NumberPeek secret={view.secret} psychic={psychic} /> : undefined;

  let screen: ReactNode;
  switch (view.stage) {
    case "choose":
      screen = (
        // Keyed by the chooser: if they leave, the round is dealt again with a
        // new one, whose screen must start with an empty pad.
        <ChooseScreen
          key={view.start.chooserId}
          role={role}
          isChooser={view.start.chooserId === selfId}
          psychic={psychic}
          chooser={nameFor(view.start.chooserId)}
          onChoose={(n) => send(encodeChooseSecret(n))}
        />
      );
      break;

    case "category":
      screen =
        role === "psychic" ? (
          <CategoryForm
            key={view.categories.length}
            psychic={psychic}
            board={board}
            serverError={serverError}
            onAsk={(text) => send(encodeSetCategory(text))}
          />
        ) : (
          <WaitScreen
            heading={t("wl.waitCategory", { who: psychic })}
            number={number}
            board={board}
            freshNewest
          />
        );
      break;

    case "answer": {
      const open = view.open!;
      const progress = { n: view.answered.length, total: view.start.giverIds.length };
      const answerKey = `${view.start.round}-${open.number}`;
      const locked = view.answered.includes(selfId) || answeredFor === answerKey;
      if (role === "giver" && !locked) {
        screen = (
          <AnswerForm
            key={answerKey}
            name={nameFor(selfId)}
            category={open.name}
            secret={view.secret}
            serverError={serverError}
            onLock={(text) => {
              setAnsweredFor(answerKey);
              send(encodeSubmitAnswer(text));
            }}
          />
        );
      } else {
        screen = (
          <WaitScreen
            kicker={role === "giver" ? t("wl.answerLocked") : t("wl.waitAnswers")}
            heading={open.name}
            progress={progress}
            number={number}
            board={board}
          />
        );
      }
      break;
    }

    case "talk":
      screen = (
        <TalkScreen
          psychic={psychic}
          givers={joinNames(view.start.giverIds.map(nameFor), locale)}
          isPsychic={role === "psychic"}
          number={number}
          onReady={() => send(encodeReadyToGuess())}
        />
      );
      break;

    case "guess":
      screen =
        role === "psychic" ? (
          <GuessScreen board={board} onGuess={(n) => send(encodeMakeGuess(n))} />
        ) : (
          <WaitScreen heading={t("wl.waitGuess", { who: psychic })} number={number} board={board} />
        );
      break;

    case "result": {
      const r = view.result!;
      const givers = r.giverIds.map(nameFor);
      const points = r.psychicWon
        ? t("wl.pointsPsychic", { n: givers.length, who: psychic })
        : `${t("wl.offBy", { n: Math.abs(r.guess - r.secret) })} ${t("wl.pointsGivers", {
            who: joinNames(givers, locale),
          })}`;
      const winners = r.winnerIds.map(nameFor);
      screen = (
        // Keyed by round: a Result resent after someone leaves updates this
        // screen without playing the reveal again.
        <ResultShow
          key={r.round}
          psychic={psychic}
          guess={r.guess}
          secret={r.secret}
          won={r.psychicWon}
          pointsLine={points}
          rows={r.scores.map((s) => ({
            key: s.playerId,
            name: nameFor(s.playerId),
            hue: hueFor(s.playerId),
            score: s.score,
            delta: s.delta,
          }))}
          note={
            r.matchOver &&
            winners.length > 0 && (
              <p className="wl-lead">
                {winners.length === 1
                  ? t("wl.finalWinner", { who: winners[0] })
                  : t("wl.finalTie", { who: joinNames(winners, locale) })}
              </p>
            )
          }
          actions={
            <button className="wl-vs-next" onClick={() => send(encodePlayAgain())}>
              {r.matchOver
                ? t("wl.backToLobby")
                : t("wl.nextRound", { who: nameFor(r.nextPsychicId) })}
            </button>
          }
        />
      );
      break;
    }
  }

  // The reveal fills the screen on its own; every other stage gets the bar.
  if (view.stage === "result") return screen;

  return (
    <>
      <div className="local-bar">
        <p className="status num wl-round">
          {t("wl.roundOf", { n: view.start.round, total: view.start.totalRounds })}
        </p>
        <span className="pill">
          {role === "psychic" ? t("wl.youArePsychic") : role === "giver" ? t("wl.youAreGiver") : t("wl.youWatch")}
        </span>
      </div>
      {screen}
    </>
  );
}

/** The server's categories as the shared Board draws them. */
function toBoard(
  categories: Category[],
  nameFor: (id: string) => string,
  hueFor: (id: string) => number,
): BoardCategory[] {
  return categories.map((c) => ({
    name: c.name,
    answers: c.answers.map((a) => ({
      key: a.playerId,
      name: nameFor(a.playerId),
      hue: hueFor(a.playerId),
      text: a.text,
    })),
  }));
}
