import { useCallback, useEffect, useState } from "react";
import { useT } from "../../../i18n";
import { GameHeader, type Stage as HeaderStage } from "../GameHeader";
import type { LocalGameProps } from "../../registry";
import { AccuseView } from "./AccuseView";
import { DealView } from "./DealView";
import { DiscussView, SpeakView } from "./PlayView";
import { EndGameButton } from "./EndGameButton";
import { newGame, resolveNames, step, type LocalEvent, type LocalGame, type Stage } from "./localGame";
import { loadGame, loadSetup, saveGame, saveSetup, type LocalSetup } from "./saved";
import { SetupView } from "./SetupView";
import { useWakeLock } from "./useWakeLock";
import { VerdictView } from "./VerdictView";
import "../imposter.css";
import "../../../screens/lobby.css";
import "./local.css";

const HEADER_STAGE: Record<Exclude<Stage["kind"], "verdict">, HeaderStage> = {
  deal: "word",
  speak: "clues",
  discuss: "vote",
  accuse: "vote",
};

// One-phone Imposter: setup, then the rules in ./localGame, rendered one stage at
// a time. Reached without mounting GameSession, so no socket is ever opened.
export function LocalImposter({ onExit }: LocalGameProps) {
  const { t } = useT();
  const [setup, setSetup] = useState<LocalSetup>(loadSetup);
  const [game, setGame] = useState<LocalGame | null>(loadGame);

  useEffect(() => saveSetup(setup), [setup]);
  useEffect(() => saveGame(game), [game]);

  // Functional update, so an event always applies to the newest game even if the
  // turn clock and a tap land in the same render.
  const dispatch = useCallback((event: LocalEvent) => {
    setGame((g) => g && step(g, event));
  }, []);

  useWakeLock(game?.stage.kind === "speak" || game?.stage.kind === "discuss");

  function deal(usedWords: string[]) {
    const names = resolveNames(setup.names, (n) => t("local.playerN", { n }));
    setGame(newGame(names, setup.settings, usedWords));
  }

  if (!game) {
    return <SetupView setup={setup} onChange={setSetup} onStart={() => deal([])} onExit={onExit} />;
  }

  const { stage } = game;

  if (stage.kind === "verdict") {
    return (
      <VerdictView
        game={game}
        accused={stage.accused}
        onPlayAgain={() => deal(game.usedWords)}
        onChangePlayers={() => setGame(null)}
      />
    );
  }

  return (
    <>
      <div className="local-bar">
        <GameHeader stage={HEADER_STAGE[stage.kind]} round={0} totalRounds={0} />
        <EndGameButton onEnd={() => setGame(null)} />
      </div>
      {stage.kind === "deal" && (
        // The key gives each player a new view, so their slip always starts face
        // down and Next player starts locked. The last person's word cannot still
        // be showing when the phone reaches the next person.
        <DealView
          key={stage.seat}
          game={game}
          seat={stage.seat}
          onNext={() => dispatch({ type: "dealNext" })}
        />
      )}
      {stage.kind === "speak" && <SpeakView game={game} stage={stage} dispatch={dispatch} />}
      {stage.kind === "discuss" && <DiscussView dispatch={dispatch} />}
      {stage.kind === "accuse" && <AccuseView game={game} dispatch={dispatch} />}
    </>
  );
}
