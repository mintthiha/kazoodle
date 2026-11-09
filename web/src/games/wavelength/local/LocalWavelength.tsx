import { useCallback, useEffect, useState } from "react";
import { useT } from "../../../i18n";
import type { LocalGameProps } from "../../registry";
import { resolveNames } from "../../onephone/seats";
import { TwoTapButton } from "../../onephone/TwoTapButton";
import { AnswerView } from "./AnswerView";
import { CategoryView } from "./CategoryView";
import { FinalView } from "./FinalView";
import { GuessView } from "./GuessView";
import { IntroView } from "./IntroView";
import { newGame, step, totalRounds, type LocalEvent, type LocalGame } from "./localGame";
import { ResultView } from "./ResultView";
import { RevealView } from "./RevealView";
import { loadGame, loadSetup, saveGame, saveSetup, type LocalSetup } from "./saved";
import { SecretView } from "./SecretView";
import { SetupView } from "./SetupView";
import { TalkView } from "./TalkView";
import { useWakeLock } from "../../onephone/useWakeLock";
import "../../../screens/lobby.css";
import "../../onephone/onephone.css";
import "./wavelength.css";

// One-phone Wavelength: setup, then the rules in ./localGame, rendered one stage
// at a time. Reached without mounting GameSession, so no socket is ever opened.
export function LocalWavelength({ onExit }: LocalGameProps) {
  const { t } = useT();
  const [setup, setSetup] = useState<LocalSetup>(loadSetup);
  const [game, setGame] = useState<LocalGame | null>(loadGame);

  useEffect(() => saveSetup(setup), [setup]);
  useEffect(() => saveGame(game), [game]);

  // A spoken round leaves the phone face up on the table for minutes at a time,
  // and a screen that locks itself would have to be unlocked for the guess.
  useWakeLock(game?.stage.kind === "talk");

  // The dice are rolled here, outside the state update, and handed in as a fixed
  // value. React may run an update function twice in development to catch impure
  // ones, and a Math.random call inside would give each run a different secret.
  const dispatch = useCallback((event: LocalEvent) => {
    const roll = Math.random();
    setGame((g) => g && step(g, event, () => roll));
  }, []);

  function start(names: string[]) {
    setGame(newGame(names, setup.settings));
  }

  if (!game) {
    return (
      <SetupView
        setup={setup}
        onChange={setSetup}
        onStart={() => start(resolveNames(setup.names, (n) => t("local.playerN", { n })))}
        onExit={onExit}
      />
    );
  }

  const { stage, round } = game;

  if (stage.kind === "final") {
    return <FinalView game={game} onPlayAgain={() => start(game.names)} onChangePlayers={() => setGame(null)} />;
  }

  // Keys on the private screens give each person a fresh one, so a slip always
  // starts face down and a text box always starts empty when the phone changes hands.
  const turn = `${game.roundIndex}-${round.categories.length}`;

  return (
    <>
      <div className="local-bar">
        <p className="status num wl-round">
          {t("wl.roundOf", { n: game.roundIndex + 1, total: totalRounds(game) })}
        </p>
        <TwoTapButton
          label={t("local.endGame")}
          confirmLabel={t("local.endGameConfirm")}
          onConfirm={() => setGame(null)}
        />
      </div>
      {stage.kind === "intro" && <IntroView game={game} onBegin={() => dispatch({ type: "begin" })} />}
      {stage.kind === "secret" && (
        <SecretView key={`${turn}-${stage.giver}`} game={game} giver={stage.giver} dispatch={dispatch} />
      )}
      {stage.kind === "talk" && <TalkView game={game} onReady={() => dispatch({ type: "readyToGuess" })} />}
      {stage.kind === "category" && <CategoryView key={turn} game={game} dispatch={dispatch} />}
      {stage.kind === "answer" && (
        <AnswerView key={`${turn}-${stage.giver}`} game={game} giver={stage.giver} dispatch={dispatch} />
      )}
      {stage.kind === "reveal" && <RevealView game={game} onContinue={() => dispatch({ type: "continue" })} />}
      {stage.kind === "guess" && <GuessView game={game} dispatch={dispatch} />}
      {stage.kind === "result" && <ResultView game={game} onNext={() => dispatch({ type: "nextRound" })} />}
    </>
  );
}
