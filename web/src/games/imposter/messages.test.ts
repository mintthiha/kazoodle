import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATCH_OPTIONS,
  decodeImposterEvent,
  decodeStartOptions,
  encodeAbstain,
  encodeCastVote,
  encodeGuessWord,
  encodeMarkReady,
  encodePlayAgain,
  encodeStartOptions,
  encodeSubmitClue,
} from "./messages";
import { DEFAULT_CLUE_PASSES, DEFAULT_ROUNDS } from "./rounds";

describe("imposter messages: encode", () => {
  it("markReady as a canonical-JSON envelope body", () => {
    expect(JSON.parse(encodeMarkReady())).toEqual({ markReady: {} });
  });

  it("submitClue", () => {
    expect(JSON.parse(encodeSubmitClue("beach"))).toEqual({ submitClue: { text: "beach" } });
  });

  it("castVote", () => {
    expect(JSON.parse(encodeCastVote("p2"))).toEqual({ castVote: { suspectId: "p2" } });
  });

  it("abstain", () => {
    expect(JSON.parse(encodeAbstain())).toEqual({ castVote: { abstain: true } });
  });

  it("guessWord", () => {
    expect(JSON.parse(encodeGuessWord("beach"))).toEqual({ guessWord: { text: "beach" } });
  });

  it("playAgain", () => {
    expect(JSON.parse(encodePlayAgain())).toEqual({ playAgain: {} });
  });

  it("startOptions with hints on", () => {
    expect(JSON.parse(encodeStartOptions({ ...DEFAULT_MATCH_OPTIONS, hintsEnabled: true }))).toEqual(
      { hintsEnabled: true, rounds: DEFAULT_ROUNDS, cluePasses: DEFAULT_CLUE_PASSES },
    );
  });

  it("startOptions carries the match length", () => {
    expect(JSON.parse(encodeStartOptions({ ...DEFAULT_MATCH_OPTIONS, rounds: 7 }))).toEqual({
      rounds: 7,
      cluePasses: DEFAULT_CLUE_PASSES,
    });
  });

  it("startOptions carries the clue passes", () => {
    expect(
      JSON.parse(encodeStartOptions({ ...DEFAULT_MATCH_OPTIONS, cluePasses: 1 })),
    ).toEqual({ rounds: DEFAULT_ROUNDS, cluePasses: 1 });
  });

  it("startOptions omits fields left at their proto default", () => {
    expect(
      JSON.parse(
        encodeStartOptions({
          hintsEnabled: false,
          category: "",
          rounds: 0,
          cluePasses: 0,
          clueSeconds: 0,
        }),
      ),
    ).toEqual({});
  });
});

describe("imposter messages: start options round-trip", () => {
  it("reads back what was encoded", () => {
    const opts = { hintsEnabled: true, category: "food", rounds: 5, cluePasses: 3, clueSeconds: 20 };
    expect(decodeStartOptions(encodeStartOptions(opts))).toEqual(opts);
  });

  it("unset counts read back as the defaults that will be played", () => {
    expect(decodeStartOptions(JSON.stringify({ category: "food" }))).toEqual({
      hintsEnabled: false,
      category: "food",
      rounds: DEFAULT_ROUNDS,
      cluePasses: DEFAULT_CLUE_PASSES,
      // Not substituted for a default: zero means no clock, and that is what
      // an unset field should play as.
      clueSeconds: 0,
    });
  });

  it("a clue clock survives the round trip, and zero stays zero", () => {
    const timed = { ...DEFAULT_MATCH_OPTIONS, clueSeconds: 30 };
    expect(decodeStartOptions(encodeStartOptions(timed)).clueSeconds).toBe(30);
    expect(decodeStartOptions(encodeStartOptions(DEFAULT_MATCH_OPTIONS)).clueSeconds).toBe(0);
  });

  it("empty and malformed payloads decode to the defaults", () => {
    expect(decodeStartOptions("")).toEqual(DEFAULT_MATCH_OPTIONS);
    expect(decodeStartOptions("not json")).toEqual(DEFAULT_MATCH_OPTIONS);
  });
});

describe("imposter messages: decode", () => {
  it("roleAssignment for crew", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({ roleAssignment: { word: "Beach", category: "Places" } }),
    );
    if (msg.body.case !== "roleAssignment") throw new Error("unreachable");
    expect(msg.body.value.isImposter).toBe(false);
    expect(msg.body.value.word).toBe("Beach");
  });

  it("roleAssignment for the imposter (no word)", () => {
    const msg = decodeImposterEvent(JSON.stringify({ roleAssignment: { isImposter: true } }));
    if (msg.body.case !== "roleAssignment") throw new Error("unreachable");
    expect(msg.body.value.isImposter).toBe(true);
    expect(msg.body.value.word).toBe("");
  });

  it("roleAssignment carries the round the match is on", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({ roleAssignment: { word: "Beach", round: 2, totalRounds: 5 } }),
    );
    if (msg.body.case !== "roleAssignment") throw new Error("unreachable");
    expect(msg.body.value.round).toBe(2);
    expect(msg.body.value.totalRounds).toBe(5);
  });

  it("outcome with the match standings", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({
        outcome: {
          imposterId: "p2",
          word: "Beach",
          crewWon: false,
          round: 3,
          totalRounds: 3,
          matchOver: true,
          winnerIds: ["p2"],
          scores: [
            { playerId: "p2", score: 6, delta: 2 },
            { playerId: "p1", score: 1 },
          ],
        },
      }),
    );
    if (msg.body.case !== "outcome") throw new Error("unreachable");
    const o = msg.body.value;
    expect(o.round).toBe(3);
    expect(o.matchOver).toBe(true);
    expect(o.winnerIds).toEqual(["p2"]);
    expect(o.scores.map((s) => [s.playerId, s.score, s.delta])).toEqual([
      ["p2", 6, 2],
      ["p1", 1, 0],
    ]);
  });

  it("a mid-match outcome has no winner and is not over", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({ outcome: { imposterId: "p2", round: 1, totalRounds: 3 } }),
    );
    if (msg.body.case !== "outcome") throw new Error("unreachable");
    expect(msg.body.value.matchOver).toBe(false);
    expect(msg.body.value.winnerIds).toEqual([]);
  });

  it("revealProgress", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({ revealProgress: { readyPlayerIds: ["a", "b"], total: 3 } }),
    );
    if (msg.body.case !== "revealProgress") throw new Error("unreachable");
    expect(msg.body.value.readyPlayerIds).toEqual(["a", "b"]);
  });

  it("clueTurn", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({
        clueTurn: {
          playerId: "p2",
          turnIndex: 1,
          total: 3,
          cluesSoFar: [{ playerId: "p1", text: "sand" }],
        },
      }),
    );
    if (msg.body.case !== "clueTurn") throw new Error("unreachable");
    expect(msg.body.value.playerId).toBe("p2");
    expect(msg.body.value.cluesSoFar).toHaveLength(1);
    expect(msg.body.value.cluesSoFar[0].playerId).toBe("p1");
    expect(msg.body.value.cluesSoFar[0].text).toBe("sand");
  });

  it("clueTurn on the second pass, with the first pass still in the recap", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({
        clueTurn: {
          playerId: "p1",
          turnIndex: 0,
          total: 2,
          cluePass: 2,
          totalCluePasses: 2,
          cluesSoFar: [
            { playerId: "p1", text: "sand" },
            { playerId: "p2", text: "towel" },
          ],
        },
      }),
    );
    if (msg.body.case !== "clueTurn") throw new Error("unreachable");
    expect(msg.body.value.cluePass).toBe(2);
    expect(msg.body.value.totalCluePasses).toBe(2);
    expect(msg.body.value.turnIndex).toBe(0);
    expect(msg.body.value.cluesSoFar).toHaveLength(2);
  });

  it("clueTurn carries the clue clock, and an untimed turn reads as zero", () => {
    const timed = decodeImposterEvent(
      JSON.stringify({ clueTurn: { playerId: "p1", total: 3, clueSeconds: 20 } }),
    );
    if (timed.body.case !== "clueTurn") throw new Error("unreachable");
    expect(timed.body.value.clueSeconds).toBe(20);

    const untimed = decodeImposterEvent(JSON.stringify({ clueTurn: { playerId: "p1", total: 3 } }));
    if (untimed.body.case !== "clueTurn") throw new Error("unreachable");
    expect(untimed.body.value.clueSeconds).toBe(0);
  });

  it("a clue entry with no text is a turn whose clock ran out", () => {
    // The server records a missed turn rather than skipping it; the UI tells
    // the two apart by the empty text. See clueList.tsx.
    const msg = decodeImposterEvent(
      JSON.stringify({
        clueTurn: {
          playerId: "p2",
          total: 3,
          cluesSoFar: [{ playerId: "p1", text: "" }],
        },
      }),
    );
    if (msg.body.case !== "clueTurn") throw new Error("unreachable");
    expect(msg.body.value.cluesSoFar[0].playerId).toBe("p1");
    expect(msg.body.value.cluesSoFar[0].text).toBe("");
  });

  it("clueTurn from a one-pass round has no pass fields set", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({ clueTurn: { playerId: "p1", total: 3, cluePass: 1, totalCluePasses: 1 } }),
    );
    if (msg.body.case !== "clueTurn") throw new Error("unreachable");
    expect(msg.body.value.totalCluePasses).toBe(1);
  });

  it("votePhase", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({
        votePhase: {
          clues: [{ playerId: "p1", text: "sand" }],
          candidateIds: ["p1", "p2", "p3"],
          voteSeconds: 30,
        },
      }),
    );
    if (msg.body.case !== "votePhase") throw new Error("unreachable");
    expect(msg.body.value.candidateIds).toEqual(["p1", "p2", "p3"]);
    expect(msg.body.value.voteSeconds).toBe(30);
  });

  it("voteTally", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({
        voteTally: { counts: [{ playerId: "p2", votes: 2 }], votedOutId: "p2", abstainCount: 1 },
      }),
    );
    if (msg.body.case !== "voteTally") throw new Error("unreachable");
    expect(msg.body.value.votedOutId).toBe("p2");
    expect(msg.body.value.counts[0].votes).toBe(2);
    expect(msg.body.value.abstainCount).toBe(1);
  });

  it("outcome", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({
        outcome: {
          imposterId: "p2",
          word: "Beach",
          category: "Places",
          crewWon: true,
          votedOutId: "p2",
        },
      }),
    );
    if (msg.body.case !== "outcome") throw new Error("unreachable");
    expect(msg.body.value.crewWon).toBe(true);
    expect(msg.body.value.word).toBe("Beach");
  });

  it("outcome with a steal attempt", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({
        outcome: {
          imposterId: "p2",
          word: "Beach",
          category: "Places",
          crewWon: false,
          votedOutId: "p2",
          stealAttempted: true,
          stealGuess: "Beach",
          stealCorrect: true,
        },
      }),
    );
    if (msg.body.case !== "outcome") throw new Error("unreachable");
    expect(msg.body.value.crewWon).toBe(false);
    expect(msg.body.value.stealAttempted).toBe(true);
    expect(msg.body.value.stealGuess).toBe("Beach");
    expect(msg.body.value.stealCorrect).toBe(true);
  });

  it("stealPrompt", () => {
    const msg = decodeImposterEvent(JSON.stringify({ stealPrompt: { imposterId: "p2" } }));
    if (msg.body.case !== "stealPrompt") throw new Error("unreachable");
    expect(msg.body.value.imposterId).toBe("p2");
  });

  it("throws on a malformed payload", () => {
    expect(() => decodeImposterEvent("not json")).toThrow();
  });
});
