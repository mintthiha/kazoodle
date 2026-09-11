import { useEffect, useState } from "react";
import { useConnection } from "../../net/useConnection";
import type { GameViewProps } from "../registry";
import { decodeImposterEvent, encodeCastVote, encodeMarkReady, encodeSubmitClue } from "./messages";
import type {
  ClueTurn,
  Outcome,
  RevealProgress,
  RoleAssignment,
  VotePhase,
  VoteProgress,
  VoteTally,
} from "./gen/imposter_pb";
import { RoleView } from "./RoleView";
import { ClueView } from "./ClueView";
import { VoteView } from "./VoteView";
import { OutcomeView } from "./OutcomeView";

// Which screen to show. Message types map to phases 1:1, except the two
// *Progress messages, which update within a phase rather than changing it.
type Phase = "reveal" | "clues" | "vote" | "outcome";

// Container for the Imposter game. Folds the game-event stream into local
// state and renders whichever phase the round is currently in.
export function ImposterGame({ selfId, players }: GameViewProps) {
  const { actions, onGameEvent } = useConnection();
  const [phase, setPhase] = useState<Phase>("reveal");

  const [role, setRole] = useState<RoleAssignment | null>(null);
  const [revealProgress, setRevealProgress] = useState<RevealProgress | null>(null);
  const [readyConfirmed, setReadyConfirmed] = useState(false);

  const [clueTurn, setClueTurn] = useState<ClueTurn | null>(null);
  const [myClue, setMyClue] = useState("");

  const [votePhase, setVotePhase] = useState<VotePhase | null>(null);
  const [voteProgress, setVoteProgress] = useState<VoteProgress | null>(null);
  const [myVote, setMyVote] = useState<string | null>(null);

  const [voteTally, setVoteTally] = useState<VoteTally | null>(null);
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
          break;
        case "voteProgress":
          setVoteProgress(msg.body.value);
          break;
        case "voteTally":
          setVoteTally(msg.body.value);
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

  function castVote(suspectId: string) {
    setMyVote(suspectId);
    actions.gameAction("imposter", encodeCastVote(suspectId));
  }

  switch (phase) {
    case "reveal":
      return (
        <RoleView
          selfId={selfId}
          players={players}
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
          votePhase={votePhase}
          progress={voteProgress}
          myVote={myVote}
          onVote={castVote}
        />
      );
    case "outcome":
      return <OutcomeView selfId={selfId} players={players} tally={voteTally} outcome={outcome} />;
  }
}
