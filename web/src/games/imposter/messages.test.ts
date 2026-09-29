import { describe, expect, it } from "vitest";
import {
  decodeImposterEvent,
  encodeCastVote,
  encodeGuessWord,
  encodeMarkReady,
  encodePlayAgain,
  encodeSubmitClue,
} from "./messages";

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

  it("guessWord", () => {
    expect(JSON.parse(encodeGuessWord("beach"))).toEqual({ guessWord: { text: "beach" } });
  });

  it("playAgain", () => {
    expect(JSON.parse(encodePlayAgain())).toEqual({ playAgain: {} });
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

  it("votePhase", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({
        votePhase: {
          clues: [{ playerId: "p1", text: "sand" }],
          candidateIds: ["p1", "p2", "p3"],
        },
      }),
    );
    if (msg.body.case !== "votePhase") throw new Error("unreachable");
    expect(msg.body.value.candidateIds).toEqual(["p1", "p2", "p3"]);
  });

  it("voteTally", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({
        voteTally: { counts: [{ playerId: "p2", votes: 2 }], votedOutId: "p2" },
      }),
    );
    if (msg.body.case !== "voteTally") throw new Error("unreachable");
    expect(msg.body.value.votedOutId).toBe("p2");
    expect(msg.body.value.counts[0].votes).toBe(2);
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
