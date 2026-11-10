import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  FibblashServerMessageSchema,
  Kind,
  VoteKind,
  type FibblashServerMessage,
} from "./gen/fibblash_pb";
import { decodeStartOptions, encodeStartOptions } from "./messages";
import { fold, isPlaying, type View } from "./view";

type Body = MessageInitShape<typeof FibblashServerMessageSchema>["body"];

const msg = (body: Body): FibblashServerMessage => create(FibblashServerMessageSchema, { body });

const intro = (number: number) =>
  msg({
    case: "questionIntro",
    value: { number, total: 3, kind: Kind.REAL, prompt: "The first webcam watched a ____.", seconds: 5, playerIds: ["p1", "p2", "p3"] },
  });

/** Fold a list of messages from nothing. */
const play = (...msgs: FibblashServerMessage[]): View | null => msgs.reduce<View | null>(fold, null);

describe("fold", () => {
  it("ignores everything before the first question", () => {
    expect(play(msg({ case: "answerProgress", value: { answeredIds: ["p1"] } }))).toBeNull();
  });

  it("walks a question through its stages", () => {
    let v = play(intro(1));
    expect(v?.stage).toBe("intro");
    expect(isPlaying(v!, "p2")).toBe(true);
    expect(isPlaying(v!, "late-joiner")).toBe(false);

    v = fold(v, msg({ case: "answerPhase", value: { seconds: 30, maxLength: 45 } }));
    expect(v).toMatchObject({ stage: "answer", seconds: 30, maxLength: 45 });

    v = fold(v, msg({ case: "yourAnswer", value: { text: "a kettle" } }));
    v = fold(v, msg({ case: "answerProgress", value: { answeredIds: ["p1"], total: 3 } }));
    expect(v).toMatchObject({ myAnswer: "a kettle", answered: ["p1"] });

    v = fold(
      v,
      msg({
        case: "votePhase",
        value: { vote: VoteKind.TRUTH, seconds: 20, choices: [{ id: "A", text: "a kettle" }, { id: "B", text: "coffee pot" }] },
      }),
    );
    expect(v).toMatchObject({ stage: "vote", canVote: null, myVote: null });
    v = fold(v, msg({ case: "yourBallot", value: { canVote: true, ownChoiceIds: ["A"] } }));
    v = fold(v, msg({ case: "voteProgress", value: { voted: 1, total: 3 } }));
    v = fold(v, msg({ case: "yourVote", value: { choiceId: "B" } }));
    expect(v).toMatchObject({ canVote: true, ownChoiceIds: ["A"], myVote: "B", voted: 1, voters: 3 });

    v = fold(v, msg({ case: "questionResult", value: { answer: "coffee pot", seconds: 8 } }));
    expect(v?.stage).toBe("result");

    v = fold(
      v,
      msg({
        case: "leaderboard",
        value: { number: 1, total: 3, seconds: 8, standings: [{ playerId: "p1", score: 1500, delta: 1500, rank: 1 }] },
      }),
    );
    expect(v).toMatchObject({ stage: "leaderboard", scores: { p1: 1500 } });
  });

  it("starts each question clean but keeps the totals", () => {
    const v = play(
      intro(1),
      msg({ case: "yourAnswer", value: { text: "a kettle" } }),
      msg({ case: "leaderboard", value: { standings: [{ playerId: "p1", score: 500 }] } }),
      intro(2),
    );
    expect(v).toMatchObject({ stage: "intro", myAnswer: null, scores: { p1: 500 } });
    expect(v?.question.number).toBe(2);
  });

  it("a new vote forgets the last one's ballot", () => {
    const v = play(
      intro(1),
      msg({ case: "votePhase", value: { vote: VoteKind.TRUTH, choices: [] } }),
      msg({ case: "yourVote", value: { choiceId: "A" } }),
      msg({ case: "votePhase", value: { vote: VoteKind.FUNNY, choices: [] } }),
    );
    expect(v).toMatchObject({ myVote: null, canVote: null });
    expect(v?.vote?.vote).toBe(VoteKind.FUNNY);
  });

  it("gives every phase its own clock key", () => {
    const keys = [
      play(intro(1)),
      play(intro(1), msg({ case: "answerPhase", value: {} })),
      play(intro(1), msg({ case: "votePhase", value: { vote: VoteKind.MATCHUP, matchup: 1 } })),
      play(intro(1), msg({ case: "votePhase", value: { vote: VoteKind.MATCHUP, matchup: 2 } })),
      play(intro(2)),
    ].map((v) => v?.clockKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ends on the final standings", () => {
    const v = play(
      intro(1),
      msg({ case: "finalResult", value: { winnerIds: ["p2"], standings: [{ playerId: "p2", score: 3000 }] } }),
    );
    expect(v).toMatchObject({ stage: "final", scores: { p2: 3000 } });
    expect(v?.final?.winnerIds).toEqual(["p2"]);
  });
});

describe("start options", () => {
  it("round-trips a match length", () => {
    expect(decodeStartOptions(encodeStartOptions({ questions: 16 }))).toEqual({ questions: 16 });
  });

  it("falls back to the default for anything else", () => {
    for (const raw of ["", "not json", '{"questions":7}']) {
      expect(decodeStartOptions(raw)).toEqual({ questions: 12 });
    }
  });
});
