import { useEffect, useState } from "react";
import { useConnection } from "../../net/useConnection";
import type { GameViewProps } from "../registry";
import {
  decodeImposterEvent,
  encodeAbstain,
  encodeCastVote,
  encodeGuessWord,
  encodeMarkReady,
  encodePlayAgain,
  encodeSubmitClue,
} from "./messages";
import type {
  ClueTurn,
  Outcome,
  RevealProgress,
  RoleAssignment,
  StealPrompt,
  VotePhase,
  VoteProgress,
  VoteTally,
} from "./gen/imposter_pb";
import { RoleView } from "./RoleView";
import { ClueView } from "./ClueView";
import { VoteView, type VoteChoice } from "./VoteView";
import { StealView } from "./StealView";
import { OutcomeView } from "./OutcomeView";

// Which screen to show. Message types map to phases 1:1, except the two
// *Progress messages, which update within a phase rather than changing it.
type Phase = "reveal" | "clues" | "vote" | "steal" | "outcome";

// Container for the Imposter game. Folds the game-event stream into local
// state and renders whichever phase the round is currently in.
export function ImposterGame({ selfId, players, departed, isHost }: GameViewProps) {
  const { actions, onGameEvent } = useConnection();
  const [phase, setPhase] = useState<Phase>("reveal");

  const [role, setRole] = useState<RoleAssignment | null>(null);
  const [revealProgress, setRevealProgress] = useState<RevealProgress | null>(null);
  const [readyConfirmed, setReadyConfirmed] = useState(false);

  const [clueTurn, setClueTurn] = useState<ClueTurn | null>(null);
  const [myClue, setMyClue] = useState("");

  const [votePhase, setVotePhase] = useState<VotePhase | null>(null);
  const [voteProgress, setVoteProgress] = useState<VoteProgress | null>(null);
  const [myVote, setMyVote] = useState<VoteChoice | null>(null);
  // How many ballots this round has opened. More than one means a player left
  // mid-vote and the server reissued the ballot, which is worth saying out
  // loud — the countdown restarting and the selection clearing are otherwise
  // unexplained. Counting is safe across a late mount: onGameEvent replays the
  // events already buffered, so a screen that mounts late still sees both.
  const [ballots, setBallots] = useState(0);

  const [voteTally, setVoteTally] = useState<VoteTally | null>(null);
  const [stealPrompt, setStealPrompt] = useState<StealPrompt | null>(null);
  const [myGuess, setMyGuess] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    // onGameEvent replays events buffered before this effect ran, then streams
    // new ones. The cleanup unsubscribes when this component unmounts.
    return onGameEvent((payload) => {
      const msg = decodeImposterEvent(payload);
      switch (msg.body.case) {
        case "roleAssignment":
          setRole(msg.body.value);
          break;
        case "revealProgress":
          setRevealProgress(msg.body.value);
          break;
        case "clueTurn":
          setPhase("clues");
          setClueTurn(msg.body.value);
          break;
        case "votePhase":
          setPhase("vote");
          setVotePhase(msg.body.value);
          // A VotePhase can arrive a second time when the candidate list changes
          // mid-vote (someone left). That is a new ballot, so this player has no
          // vote recorded on it any more.
          setMyVote(null);
          setBallots((n) => n + 1);
          break;
        case "voteProgress":
          setVoteProgress(msg.body.value);
          break;
        case "voteTally":
          setVoteTally(msg.body.value);
          break;
        case "stealPrompt":
          setPhase("steal");
          setStealPrompt(msg.body.value);
          break;
        case "outcome":
          setPhase("outcome");
          setOutcome(msg.body.value);
          break;
      }
    });
  }, [onGameEvent]);

  function confirmReady() {
    setReadyConfirmed(true);
    actions.gameAction("imposter", encodeMarkReady());
  }

  function sendClue() {
    const text = myClue.trim();
    if (!text) return;
    actions.gameAction("imposter", encodeSubmitClue(text));
    setMyClue("");
  }

  function lockInVote(choice: VoteChoice) {
    setMyVote(choice);
    if (choice.kind === "abstain") {
      actions.gameAction("imposter", encodeAbstain());
    } else {
      actions.gameAction("imposter", encodeCastVote(choice.id));
    }
  }

  function sendGuess() {
    const text = myGuess.trim();
    if (!text) return;
    actions.gameAction("imposter", encodeGuessWord(text));
    setMyGuess("");
  }

  function playAgain() {
    actions.gameAction("imposter", encodePlayAgain());
  }

  switch (phase) {
    case "reveal":
      return (
        <RoleView
          selfId={selfId}
          players={players}
          departed={departed}
          isHost={isHost}
          role={role}
          progress={revealProgress}
          ready={readyConfirmed}
          onConfirm={confirmReady}
        />
      );
    case "clues":
      return (
        <ClueView
          selfId={selfId}
          players={players}
          departed={departed}
          isHost={isHost}
          turn={clueTurn}
          value={myClue}
          onChange={setMyClue}
          onSubmit={sendClue}
        />
      );
    case "vote":
      return (
        <VoteView
          selfId={selfId}
          players={players}
          departed={departed}
          isHost={isHost}
          votePhase={votePhase}
          reopened={ballots > 1}
          progress={voteProgress}
          myVote={myVote}
          onLockIn={lockInVote}
        />
      );
    case "steal":
      return (
        <StealView
          selfId={selfId}
          players={players}
          departed={departed}
          isHost={isHost}
          prompt={stealPrompt}
          value={myGuess}
          onChange={setMyGuess}
          onSubmit={sendGuess}
        />
      );
    case "outcome":
      return (
        <OutcomeView
          selfId={selfId}
          players={players}
          departed={departed}
          isHost={isHost}
          tally={voteTally}
          outcome={outcome}
          onPlayAgain={playAgain}
        />
      );
  }
}
