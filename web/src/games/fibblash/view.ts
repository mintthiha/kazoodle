// What a phone or the main screen shows in Fibblash, as a pure fold over the
// server's messages: the current view plus one message gives the next view. No
// React and no socket, so every transition is testable on its own, and a
// reconnecting phone rebuilds its screen just by folding the replayed messages
// again.
//
// The phone and the main screen fold the same stream. The main screen simply
// never receives the private messages ("Your…"), so those fields stay empty.

import {
  type FibblashServerMessage,
  type FinalResult,
  type Leaderboard,
  type MatchupResult,
  type QuestionIntro,
  type QuestionResult,
  type VotePhase,
} from "./gen/fibblash_pb";

export type Stage = "intro" | "answer" | "vote" | "matchupResult" | "result" | "leaderboard" | "final";

export interface View {
  /** The question being played. */
  question: QuestionIntro;
  stage: Stage;
  /** Seconds on the current phase's clock, and a key that changes whenever a
   * new clock starts, for useCountdown. */
  seconds: number;
  clockKey: string;
  maxLength: number;

  /** Who has answered. Never what. */
  answered: string[];
  /** This phone's own accepted answer. */
  myAnswer: string | null;

  /** The open vote, while the stage is "vote". */
  vote: VotePhase | null;
  /** What this phone may do in it. Null until the server says. */
  canVote: boolean | null;
  ownChoiceIds: string[];
  myVote: string | null;
  voted: number;
  voters: number;

  matchupResult: MatchupResult | null;
  result: QuestionResult | null;
  leaderboard: Leaderboard | null;
  final: FinalResult | null;

  /** Everyone's total as of the last leaderboard. Kept across questions. */
  scores: Record<string, number>;
}

/** The fresh view a question opens with. Only the running totals carry over. */
function opening(question: QuestionIntro, scores: Record<string, number>): View {
  return {
    question,
    stage: "intro",
    seconds: question.seconds,
    clockKey: `${question.number}:intro`,
    maxLength: 0,
    answered: [],
    myAnswer: null,
    vote: null,
    canVote: null,
    ownChoiceIds: [],
    myVote: null,
    voted: 0,
    voters: 0,
    matchupResult: null,
    result: null,
    leaderboard: null,
    final: null,
    scores,
  };
}

/** Apply one server message. Before the first question there is nothing to
 * show, so anything else is ignored until one arrives. */
export function fold(view: View | null, msg: FibblashServerMessage): View | null {
  const body = msg.body;
  if (body.case === "questionIntro") return opening(body.value, view?.scores ?? {});
  if (view === null) return null;

  const n = view.question.number;
  switch (body.case) {
    case "answerPhase":
      return {
        ...view,
        stage: "answer",
        seconds: body.value.seconds,
        clockKey: `${n}:answer`,
        maxLength: body.value.maxLength,
      };
    case "answerProgress":
      return { ...view, answered: body.value.answeredIds };
    case "yourAnswer":
      return { ...view, myAnswer: body.value.text };

    case "votePhase": {
      const v = body.value;
      return {
        ...view,
        stage: "vote",
        vote: v,
        seconds: v.seconds,
        clockKey: `${n}:vote:${v.vote}:${v.matchup}`,
        canVote: null,
        ownChoiceIds: [],
        myVote: null,
        voted: 0,
        voters: 0,
        matchupResult: null,
      };
    }
    case "yourBallot":
      return { ...view, canVote: body.value.canVote, ownChoiceIds: body.value.ownChoiceIds };
    case "voteProgress":
      return { ...view, voted: body.value.voted, voters: body.value.total };
    case "yourVote":
      return { ...view, myVote: body.value.choiceId };

    case "matchupResult":
      return {
        ...view,
        stage: "matchupResult",
        matchupResult: body.value,
        seconds: body.value.seconds,
        clockKey: `${n}:matchupResult:${body.value.matchup}`,
      };
    case "questionResult":
      return {
        ...view,
        stage: "result",
        result: body.value,
        seconds: body.value.seconds,
        clockKey: `${n}:result`,
      };
    case "leaderboard": {
      const scores: Record<string, number> = {};
      for (const s of body.value.standings) scores[s.playerId] = s.score;
      return {
        ...view,
        stage: "leaderboard",
        leaderboard: body.value,
        scores,
        seconds: body.value.seconds,
        clockKey: `${n}:leaderboard`,
      };
    }
    case "finalResult": {
      const scores: Record<string, number> = {};
      for (const s of body.value.standings) scores[s.playerId] = s.score;
      return { ...view, stage: "final", final: body.value, scores, seconds: 0, clockKey: "final" };
    }
    default:
      return view;
  }
}

/** Whether this player is taking part in the current question. A phone that
 * joined the room after the match started only watches. */
export function isPlaying(view: View, selfId: string): boolean {
  return view.question.playerIds.includes(selfId);
}
