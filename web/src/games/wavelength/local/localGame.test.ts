import { describe, expect, it } from "vitest";
import {
  CATEGORIES_PER_ROUND,
  DEFAULT_SETTINGS,
  HIGHEST,
  LOWEST,
  MAX_ANSWER_LENGTH,
  MAX_CATEGORY_LENGTH,
  answerProblem,
  categoryProblem,
  clueGivers,
  currentCategory,
  leaders,
  newGame,
  psychicWon,
  roundPoints,
  step,
  type LocalEvent,
  type LocalGame,
  type LocalSettings,
} from "./localGame";

const NAMES = ["Ana", "Ben", "Cleo"];
const CHOSEN: LocalSettings = { ...DEFAULT_SETTINGS, secret: "chosen" };
const SPOKEN: LocalSettings = { ...DEFAULT_SETTINGS, answers: "spoken" };

// Always rolls the lowest value, so the secret is always 1.
const lowRng = () => 0;
// Just under 1, the highest roll there is, so the secret is always 10.
const highRng = () => 0.999;

function apply(game: LocalGame, ...events: LocalEvent[]): LocalGame {
  return events.reduce((g, ev) => step(g, ev, lowRng), game);
}

/** A three-player game of round 1 that has reached `stage`, secret 1. */
function playedTo(stage: "category" | "guess", settings = DEFAULT_SETTINGS): LocalGame {
  let g = apply(newGame(NAMES, settings, lowRng), { type: "begin" });
  g = settings.secret === "chosen" ? apply(g, { type: "chooseSecret", value: 1 }) : g;
  g = apply(g, ...clueGivers(g).slice(settings.secret === "chosen" ? 1 : 0).map(() => ({ type: "secretSeen" }) as const));
  if (stage === "category") return g;
  for (let c = 0; c < CATEGORIES_PER_ROUND; c++) {
    g = apply(
      g,
      { type: "setCategory", text: `Cat ${c}` },
      { type: "submitAnswer", text: "a" },
      { type: "submitAnswer", text: "b" },
      { type: "continue" },
    );
  }
  return g;
}

describe("newGame", () => {
  it("starts round one with seat 0 as the Psychic and nobody scoring", () => {
    const g = newGame(NAMES, DEFAULT_SETTINGS, lowRng);
    expect(g.roundIndex).toBe(0);
    expect(g.round.psychic).toBe(0);
    expect(g.scores).toEqual([0, 0, 0]);
    expect(g.stage).toEqual({ kind: "intro" });
  });

  const draws = [
    { name: "lowest roll", rng: lowRng, want: LOWEST },
    { name: "highest roll", rng: highRng, want: HIGHEST },
  ];
  for (const tt of draws) {
    it(`draws the secret from the whole range: ${tt.name}`, () => {
      expect(newGame(NAMES, DEFAULT_SETTINGS, tt.rng).round.secret).toBe(tt.want);
    });
  }

  it("leaves a chosen secret for the Clue Givers to enter", () => {
    expect(newGame(NAMES, CHOSEN, lowRng).round.secret).toBeNull();
  });
});

describe("clueGivers", () => {
  it("goes round the table from the Psychic's left", () => {
    const g = newGame(["a", "b", "c", "d"], DEFAULT_SETTINGS, lowRng);
    expect(clueGivers(g)).toEqual([1, 2, 3]);
    expect(clueGivers({ ...g, round: { ...g.round, psychic: 2 } })).toEqual([3, 0, 1]);
  });
});

describe("the secret", () => {
  it("passes the phone to every Clue Giver, then to the Psychic", () => {
    const g = apply(newGame(NAMES, DEFAULT_SETTINGS, lowRng), { type: "begin" });
    expect(g.stage).toEqual({ kind: "secret", giver: 0 });
    const g2 = apply(g, { type: "secretSeen" });
    expect(g2.stage).toEqual({ kind: "secret", giver: 1 });
    expect(apply(g2, { type: "secretSeen" }).stage).toEqual({ kind: "category" });
  });

  it("lets the first Clue Giver enter a chosen number", () => {
    const g = apply(newGame(NAMES, CHOSEN, lowRng), { type: "begin" }, { type: "chooseSecret", value: 7 });
    expect(g.round.secret).toBe(7);
    expect(g.stage).toEqual({ kind: "secret", giver: 1 });
  });

  const refused = [
    { name: "a number below the range", settings: CHOSEN, value: LOWEST - 1 },
    { name: "a number above the range", settings: CHOSEN, value: HIGHEST + 1 },
    { name: "a fraction", settings: CHOSEN, value: 2.5 },
    { name: "a number when the app picks", settings: DEFAULT_SETTINGS, value: 5 },
  ];
  for (const tt of refused) {
    it(`refuses ${tt.name}`, () => {
      const g = apply(newGame(NAMES, tt.settings, highRng), { type: "begin" });
      expect(step(g, { type: "chooseSecret", value: tt.value })).toBe(g);
    });
  }

  it("does not move on from a chosen secret nobody has entered", () => {
    const g = apply(newGame(NAMES, CHOSEN, lowRng), { type: "begin" });
    expect(step(g, { type: "secretSeen" })).toBe(g);
  });

  it("does not let a later Clue Giver change the chosen number", () => {
    const g = apply(newGame(NAMES, CHOSEN, lowRng), { type: "begin" }, { type: "chooseSecret", value: 7 });
    expect(step(g, { type: "chooseSecret", value: 3 })).toBe(g);
  });
});

describe("categoryProblem", () => {
  const round = playedTo("category").round;
  const withOne = { ...round, categories: ["Animals"] };
  const tests = [
    { name: "a fine category", r: round, text: "Animals", want: null },
    { name: "blank", r: round, text: "   ", want: "empty" },
    { name: "too long", r: round, text: "x".repeat(MAX_CATEGORY_LENGTH + 1), want: "tooLong" },
    { name: "exactly the limit", r: round, text: "x".repeat(MAX_CATEGORY_LENGTH), want: null },
    { name: "asked already, any case", r: withOne, text: " animals ", want: "repeated" },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(categoryProblem(tt.r, tt.text)).toBe(tt.want);
    });
  }
});

describe("answerProblem", () => {
  const tests = [
    { name: "a fine answer", text: "Otter", want: null },
    { name: "blank", text: "", want: "empty" },
    { name: "too long", text: "x".repeat(MAX_ANSWER_LENGTH + 1), want: "tooLong" },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(answerProblem(tt.text)).toBe(tt.want);
    });
  }
});

describe("categories and answers", () => {
  it("collects one answer per Clue Giver, in order, then reveals them", () => {
    let g = apply(playedTo("category"), { type: "setCategory", text: "  Animals " });
    expect(currentCategory(g.round)).toBe("Animals");
    expect(g.stage).toEqual({ kind: "answer", giver: 0 });

    g = apply(g, { type: "submitAnswer", text: " Otter " });
    expect(g.stage).toEqual({ kind: "answer", giver: 1 });

    g = apply(g, { type: "submitAnswer", text: "Wasp" });
    expect(g.stage).toEqual({ kind: "reveal" });
    expect(g.round.answers).toEqual([["Otter", "Wasp"]]);
  });

  it("refuses a category with a problem", () => {
    const g = playedTo("category");
    expect(step(g, { type: "setCategory", text: "" })).toBe(g);
  });

  it("refuses a blank answer", () => {
    const g = apply(playedTo("category"), { type: "setCategory", text: "Animals" });
    expect(step(g, { type: "submitAnswer", text: "  " })).toBe(g);
  });

  it("asks for another category until there are three, then for the guess", () => {
    let g = playedTo("category");
    for (let c = 0; c < CATEGORIES_PER_ROUND; c++) {
      g = apply(
        g,
        { type: "setCategory", text: `Cat ${c}` },
        { type: "submitAnswer", text: "a" },
        { type: "submitAnswer", text: "b" },
        { type: "continue" },
      );
      const want = c + 1 < CATEGORIES_PER_ROUND ? "category" : "guess";
      expect(g.stage.kind).toBe(want);
    }
    expect(g.round.answers).toHaveLength(CATEGORIES_PER_ROUND);
  });
});

describe("roundPoints", () => {
  // Secret 1 (lowRng), four players, seat 0 the Psychic.
  const g = newGame(["a", "b", "c", "d"], DEFAULT_SETTINGS, lowRng);
  const tests = [
    { name: "a right guess pays the Psychic one per Clue Giver", guess: 1, want: [3, 0, 0, 0] },
    { name: "a wrong guess pays each Clue Giver one", guess: 2, want: [0, 1, 1, 1] },
    { name: "being off by a lot is still just wrong", guess: HIGHEST, want: [0, 1, 1, 1] },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(roundPoints(g, tt.guess)).toEqual(tt.want);
    });
  }
});

describe("the guess", () => {
  it("scores the round and shows the result", () => {
    const g = apply(playedTo("guess"), { type: "guess", value: 1 });
    expect(g.stage).toEqual({ kind: "result" });
    expect(g.round.guess).toBe(1);
    expect(psychicWon(g.round)).toBe(true);
    expect(g.scores).toEqual([2, 0, 0]);
  });

  it("pays the Clue Givers for a miss", () => {
    const g = apply(playedTo("guess"), { type: "guess", value: 4 });
    expect(psychicWon(g.round)).toBe(false);
    expect(g.scores).toEqual([0, 1, 1]);
  });

  it("refuses a number outside the range", () => {
    const g = playedTo("guess");
    expect(step(g, { type: "guess", value: 0 })).toBe(g);
  });

  it("counts only once if the button is tapped twice", () => {
    const g = apply(playedTo("guess"), { type: "guess", value: 1 }, { type: "guess", value: 1 });
    expect(g.scores).toEqual([2, 0, 0]);
  });
});

describe("nextRound", () => {
  it("hands the Psychic role to the next seat with a fresh round, keeping scores", () => {
    const done = apply(playedTo("guess"), { type: "guess", value: 1 });
    const g = step(done, { type: "nextRound" }, highRng);
    expect(g.roundIndex).toBe(1);
    expect(g.round).toEqual({ psychic: 1, secret: HIGHEST, categories: [], answers: [], guess: null });
    expect(g.scores).toEqual([2, 0, 0]);
    expect(g.stage).toEqual({ kind: "intro" });
  });

  it("ends the game after everyone has been the Psychic", () => {
    const g = apply(playedTo("guess"), { type: "guess", value: 1 });
    const last = { ...g, roundIndex: NAMES.length - 1 };
    expect(step(last, { type: "nextRound" }).stage).toEqual({ kind: "final" });
  });

  it("works for a chosen secret too", () => {
    const g = apply(playedTo("guess", CHOSEN), { type: "guess", value: 1 }, { type: "nextRound" });
    expect(g.round.secret).toBeNull();
  });
});

describe("events out of turn", () => {
  const fresh = newGame(NAMES, DEFAULT_SETTINGS, lowRng);
  const events: LocalEvent[] = [
    { type: "secretSeen" },
    { type: "setCategory", text: "Animals" },
    { type: "submitAnswer", text: "Otter" },
    { type: "continue" },
    { type: "guess", value: 1 },
    { type: "nextRound" },
  ];
  for (const ev of events) {
    it(`ignores ${ev.type} before the round has begun`, () => {
      expect(step(fresh, ev)).toBe(fresh);
    });
  }
});

describe("spoken answers", () => {
  function talking(settings = SPOKEN): LocalGame {
    let g = apply(newGame(NAMES, settings, lowRng), { type: "begin" });
    if (settings.secret === "chosen") g = apply(g, { type: "chooseSecret", value: 4 });
    while (g.stage.kind === "secret") g = apply(g, { type: "secretSeen" });
    return g;
  }

  it("puts the phone on the table once every Clue Giver has the number", () => {
    expect(talking().stage).toEqual({ kind: "talk" });
  });

  it("works with a number the Clue Givers chose", () => {
    const g = talking({ answers: "spoken", secret: "chosen" });
    expect(g.stage).toEqual({ kind: "talk" });
    expect(g.round.secret).toBe(4);
  });

  it("goes from talking straight to the guess, with nothing recorded", () => {
    const g = apply(talking(), { type: "readyToGuess" });
    expect(g.stage).toEqual({ kind: "guess" });
    expect(g.round.categories).toEqual([]);
  });

  it("scores the guess the same way as typed answers", () => {
    const g = apply(talking(), { type: "readyToGuess" }, { type: "guess", value: 1 });
    expect(g.stage).toEqual({ kind: "result" });
    expect(g.scores).toEqual([2, 0, 0]);
  });

  it("refuses typed categories and answers while talking", () => {
    const g = talking();
    expect(step(g, { type: "setCategory", text: "Animals" })).toBe(g);
    expect(step(g, { type: "submitAnswer", text: "Otter" })).toBe(g);
  });

  it("ignores readyToGuess outside the talk", () => {
    const g = playedTo("category");
    expect(step(g, { type: "readyToGuess" })).toBe(g);
  });

  it("keeps talking in the next round", () => {
    const done = apply(talking(), { type: "readyToGuess" }, { type: "guess", value: 1 }, { type: "nextRound" });
    const g = apply(done, { type: "begin" }, { type: "secretSeen" }, { type: "secretSeen" });
    expect(g.stage).toEqual({ kind: "talk" });
  });
});

describe("leaders", () => {
  const tests = [
    { name: "one clear winner", scores: [1, 4, 2], want: [1] },
    { name: "a shared lead", scores: [3, 1, 3], want: [0, 2] },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(leaders(tt.scores)).toEqual(tt.want);
    });
  }
});
