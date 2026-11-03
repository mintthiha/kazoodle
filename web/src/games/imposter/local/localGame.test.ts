import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  WORDS,
  canOpenAccuse,
  crewWon,
  duplicateSeats,
  isImposter,
  newGame,
  pickWord,
  resizeNames,
  resolveNames,
  roleFor,
  speakerSeat,
  step,
  type LocalEvent,
  type LocalGame,
  type LocalSettings,
} from "./localGame";

const NAMES = ["Ana", "Ben", "Cleo"];
const AUTO: LocalSettings = { ...DEFAULT_SETTINGS, advance: "auto", cluePasses: 2 };

// Always rolls the lowest value, so the first word, seat 0 as the imposter, and
// the first seat that is not an imposter speaking first.
const lowRng = () => 0;

function apply(game: LocalGame, ...events: LocalEvent[]): LocalGame {
  return events.reduce(step, game);
}

function dealtGame(settings: LocalSettings): LocalGame {
  return apply(newGame(NAMES, settings, [], lowRng), ...NAMES.map(() => ({ type: "dealNext" }) as const));
}

describe("pickWord", () => {
  it("draws only from the chosen category", () => {
    for (let i = 0; i < 50; i++) {
      expect(pickWord("food", [], Math.random).categoryKey).toBe("food");
    }
  });

  it("treats an unknown category as any", () => {
    expect(pickWord("not-a-category", [], lowRng)).toBe(WORDS[0]);
  });

  it("skips words already played", () => {
    const first = WORDS[0].word.en;
    expect(pickWord("", [first], lowRng).word.en).not.toBe(first);
  });

  it("deals repeats rather than failing once a category is played through", () => {
    const food = WORDS.filter((w) => w.categoryKey === "food").map((w) => w.word.en);
    expect(food).toContain(pickWord("food", food, Math.random).word.en);
  });

  describe("with a custom category", () => {
    const ours = {
      key: "custom:1",
      name: "Ours",
      words: [
        { word: "Red", hint: "Tomato" },
        { word: "Green", hint: "Grass" },
        { word: "Blue", hint: "Sky" },
      ],
    };
    const list = ours.words.map((w) => w.word);

    it("draws only from the custom words", () => {
      for (let i = 0; i < 50; i++) {
        expect(list).toContain(pickWord(ours.key, [], Math.random, [ours]).word.en);
      }
    });

    it("works through every word before repeating one", () => {
      const used: string[] = [];
      for (let i = 0; i < list.length; i++) {
        used.push(pickWord(ours.key, used, Math.random, [ours]).word.en);
      }
      expect([...used].sort()).toEqual([...list].sort());
      expect(list).toContain(pickWord(ours.key, used, Math.random, [ours]).word.en);
    });

    it("is left out of any category", () => {
      for (let i = 0; i < 200; i++) {
        expect(pickWord("", [], Math.random, [ours]).categoryKey).not.toBe(ours.key);
      }
    });

    it("falls back to any once the category is gone", () => {
      expect(pickWord(ours.key, [], lowRng, [])).toBe(WORDS[0]);
    });

    // lowRng deals the first word, Red, with seat 0 as the imposter.
    const dealt = (hintsEnabled: boolean) =>
      newGame(NAMES, { ...DEFAULT_SETTINGS, category: ours.key, hintsEnabled }, [], lowRng, [ours]);

    it("gives the imposter the dealt word's own hint when hints are on", () => {
      expect(roleFor(dealt(true), 0, "en")).toEqual({
        isImposter: true,
        word: "",
        category: "Ours",
        hint: "Tomato",
        partner: "",
      });
    });

    it("shows the hint as typed in either language", () => {
      expect(roleFor(dealt(true), 0, "fr").hint).toBe("Tomato");
    });

    it("keeps the hint from the imposter when hints are off", () => {
      expect(roleFor(dealt(false), 0, "en").hint).toBe("");
    });

    it("never shows the crew a hint", () => {
      expect(roleFor(dealt(true), 1, "en")).toEqual({
        isImposter: false,
        word: "Red",
        category: "Ours",
        hint: "",
        partner: "",
      });
    });
  });
});

describe("resolveNames", () => {
  const tests = [
    { name: "keeps typed names, trimmed", raw: [" Ana ", "Ben"], want: ["Ana", "Ben"] },
    { name: "numbers a blank seat by position", raw: ["Ana", "", "   "], want: ["Ana", "P2", "P3"] },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(resolveNames(tt.raw, (n) => `P${n}`)).toEqual(tt.want);
    });
  }
});

describe("duplicateSeats", () => {
  const tests = [
    { name: "all different", names: ["Ana", "Ben", "Cleo"], want: [] },
    { name: "same name in different case", names: ["Sam", "Ben", "SAM"], want: [0, 2] },
    { name: "every seat in a three-way clash", names: ["a", "a", "a"], want: [0, 1, 2] },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect([...duplicateSeats(tt.names)].sort()).toEqual(tt.want);
    });
  }
});

describe("resizeNames", () => {
  const tests = [
    { name: "growing keeps names and adds blanks", from: ["a", "b", "c"], to: 4, want: ["a", "b", "c", ""] },
    { name: "shrinking drops from the end", from: ["a", "b", "c", "d"], to: 3, want: ["a", "b", "c"] },
    { name: "stops at the minimum", from: ["a", "b", "c"], to: 1, want: ["a", "b", "c"] },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(resizeNames(tt.from, tt.to)).toEqual(tt.want);
    });
  }

  it("stops at the maximum", () => {
    expect(resizeNames([], MAX_PLAYERS + 5)).toHaveLength(MAX_PLAYERS);
    expect(resizeNames([], 0)).toHaveLength(MIN_PLAYERS);
  });
});

describe("newGame", () => {
  it("starts at the first seat's deal and remembers the word", () => {
    const g = newGame(NAMES, DEFAULT_SETTINGS, ["Old"], lowRng);
    expect(g.stage).toEqual({ kind: "deal", seat: 0 });
    expect(g.usedWords).toEqual(["Old", g.entry.word.en]);
  });

  it("can make any seat the imposter", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(newGame(NAMES, DEFAULT_SETTINGS, []).imposter);
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });
});

describe("who gets dealt what", () => {
  const SEVEN = ["a", "b", "c", "d", "e", "f", "g"];

  it("never has an imposter speak first", () => {
    for (const names of [NAMES, SEVEN]) {
      for (let i = 0; i < 300; i++) {
        const g = newGame(names, DEFAULT_SETTINGS, []);
        expect(isImposter(g, g.firstSeat)).toBe(false);
      }
    }
  });

  it("still lets every crew seat speak first", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      seen.add(newGame(NAMES, DEFAULT_SETTINGS, [], lowRng).firstSeat);
      const g = newGame(NAMES, DEFAULT_SETTINGS, []);
      if (g.imposter === 0) seen.add(g.firstSeat);
    }
    expect([...seen].sort()).toEqual([1, 2]);
  });

  const tests = [
    { name: "a small table", names: NAMES, twoImposters: true, wantPartner: false },
    { name: "six players", names: SEVEN.slice(0, 6), twoImposters: true, wantPartner: false },
    { name: "seven players", names: SEVEN, twoImposters: true, wantPartner: true },
    { name: "seven players, switched off", names: SEVEN, twoImposters: false, wantPartner: false },
  ];
  for (const tt of tests) {
    it(`${tt.name} ${tt.wantPartner ? "gets" : "does not get"} a second imposter`, () => {
      const settings = { ...DEFAULT_SETTINGS, twoImposters: tt.twoImposters };
      for (let i = 0; i < 100; i++) {
        const g = newGame(tt.names, settings, []);
        expect(g.partner !== null).toBe(tt.wantPartner);
        expect(g.partner).not.toBe(g.imposter);
      }
    });
  }

  it("tells two imposters about each other and nobody else", () => {
    const g = { ...newGame(SEVEN, DEFAULT_SETTINGS, []), imposter: 1, partner: 4 };
    expect(roleFor(g, 1, "en").partner).toBe("e");
    expect(roleFor(g, 4, "en").partner).toBe("b");
    expect(roleFor(g, 0, "en").partner).toBe("");
    expect(roleFor(g, 4, "en").word).toBe("");
  });

  it("counts catching either imposter", () => {
    const g = { ...newGame(SEVEN, DEFAULT_SETTINGS, []), imposter: 1, partner: 4 };
    expect(crewWon(g, 1)).toBe(true);
    expect(crewWon(g, 4)).toBe(true);
    expect(crewWon(g, 0)).toBe(false);
  });
});

describe("the deal", () => {
  it("walks every seat, then starts the first turn", () => {
    let g = newGame(NAMES, DEFAULT_SETTINGS, [], lowRng);
    g = step(g, { type: "dealNext" });
    expect(g.stage).toEqual({ kind: "deal", seat: 1 });
    g = step(g, { type: "dealNext" });
    expect(g.stage).toEqual({ kind: "deal", seat: 2 });
    g = step(g, { type: "dealNext" });
    expect(g.stage).toEqual({ kind: "speak", pass: 1, turn: 0 });
  });
});

describe("manual mode", () => {
  it("offers Reveal on every turn", () => {
    let g = dealtGame(DEFAULT_SETTINGS);
    for (let i = 0; i < 5; i++) {
      expect(canOpenAccuse(g)).toBe(true);
      g = step(g, { type: "turnDone" });
    }
  });

  it("keeps going around the table with no limit", () => {
    const g = apply(dealtGame(DEFAULT_SETTINGS), ...Array(7).fill({ type: "turnDone" }));
    expect(g.stage).toEqual({ kind: "speak", pass: 3, turn: 1 });
  });

  it("speaks in table order from the first seat, wrapping past the end", () => {
    const g = { ...dealtGame(DEFAULT_SETTINGS), firstSeat: 2 };
    expect([0, 1, 2].map((turn) => speakerSeat(g, turn))).toEqual([2, 0, 1]);
  });
});

describe("auto mode", () => {
  it("refuses Reveal while turns remain", () => {
    const g = dealtGame(AUTO);
    expect(canOpenAccuse(g)).toBe(false);
    expect(step(g, { type: "openAccuse" })).toBe(g);
  });

  it("opens Reveal only after the last turn of the last pass", () => {
    let g = dealtGame(AUTO);
    // Two passes of three players is six turns; the first five leave it locked.
    for (let i = 0; i < 5; i++) {
      g = step(g, { type: "turnDone" });
      expect(canOpenAccuse(g)).toBe(false);
    }
    g = step(g, { type: "turnDone" });
    expect(g.stage).toEqual({ kind: "discuss" });
    expect(canOpenAccuse(g)).toBe(true);
  });
});

describe("accusing", () => {
  it("Back returns to the turn it came from", () => {
    const before = apply(dealtGame(DEFAULT_SETTINGS), { type: "turnDone" });
    const g = apply(before, { type: "openAccuse" }, { type: "backFromAccuse" });
    expect(g.stage).toEqual(before.stage);
  });

  it("Back returns to the discussion in auto mode", () => {
    const talking = apply(dealtGame(AUTO), ...Array(6).fill({ type: "turnDone" }));
    const g = apply(talking, { type: "openAccuse" }, { type: "backFromAccuse" });
    expect(g.stage).toEqual({ kind: "discuss" });
  });

  it("records who was accused", () => {
    const g = apply(dealtGame(DEFAULT_SETTINGS), { type: "openAccuse" }, { type: "accuse", seat: 2 });
    expect(g.stage).toEqual({ kind: "verdict", accused: 2 });
  });

  it("opens a steal only when the accused really is the imposter", () => {
    // lowRng makes seat 0 the imposter.
    const g = apply(dealtGame(DEFAULT_SETTINGS), { type: "openAccuse" }, { type: "accuse", seat: 0 });
    expect(g.stage).toEqual({ kind: "verdict", accused: 0, steal: "pending" });
  });

  it("the table's ruling decides the steal, once", () => {
    const caught = apply(dealtGame(DEFAULT_SETTINGS), { type: "openAccuse" }, { type: "accuse", seat: 0 });
    const hit = step(caught, { type: "stealResult", correct: true });
    expect(hit.stage).toEqual({ kind: "verdict", accused: 0, steal: "hit" });
    expect(step(hit, { type: "stealResult", correct: false })).toBe(hit);

    const miss = step(caught, { type: "stealResult", correct: false });
    expect(miss.stage).toEqual({ kind: "verdict", accused: 0, steal: "miss" });
  });

  it("a correct steal takes the win from the crew", () => {
    const g = { ...dealtGame(DEFAULT_SETTINGS), imposter: 1 };
    expect(crewWon(g, 1, "pending")).toBe(true);
    expect(crewWon(g, 1, "miss")).toBe(true);
    expect(crewWon(g, 1, "hit")).toBe(false);
  });

  it("an innocent accused has no steal to rule on", () => {
    const g = apply(dealtGame(DEFAULT_SETTINGS), { type: "openAccuse" }, { type: "accuse", seat: 2 });
    expect(step(g, { type: "stealResult", correct: true })).toBe(g);
  });

  it("the crew wins only by naming the imposter", () => {
    const g = { ...dealtGame(DEFAULT_SETTINGS), imposter: 1 };
    expect(crewWon(g, 1)).toBe(true);
    expect(crewWon(g, 0)).toBe(false);
  });
});

describe("events that make no sense right now change nothing", () => {
  const dealing = newGame(NAMES, DEFAULT_SETTINGS, [], lowRng);
  const speaking = dealtGame(DEFAULT_SETTINGS);
  const accusing = step(speaking, { type: "openAccuse" });
  const decided = step(accusing, { type: "accuse", seat: 0 });

  const tests: { name: string; game: LocalGame; event: LocalEvent }[] = [
    { name: "a turn ending during the deal", game: dealing, event: { type: "turnDone" } },
    { name: "Reveal during the deal", game: dealing, event: { type: "openAccuse" } },
    { name: "a late Next player after the deal", game: speaking, event: { type: "dealNext" } },
    { name: "the clock firing on the ballot", game: accusing, event: { type: "turnDone" } },
    { name: "accusing a seat that does not exist", game: accusing, event: { type: "accuse", seat: 9 } },
    { name: "accusing without opening the ballot", game: speaking, event: { type: "accuse", seat: 0 } },
    { name: "a second accusation", game: decided, event: { type: "accuse", seat: 1 } },
    { name: "Back from the verdict", game: decided, event: { type: "backFromAccuse" } },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(step(tt.game, tt.event)).toBe(tt.game);
    });
  }
});

describe("roleFor", () => {
  const entry = WORDS[0];
  const base = { ...newGame(NAMES, DEFAULT_SETTINGS, [], lowRng), entry, imposter: 1 };

  it("gives the crew the word in the current language, and no hint", () => {
    expect(roleFor(base, 0, "fr")).toEqual({
      isImposter: false,
      word: entry.word.fr,
      category: entry.category.fr,
      hint: "",
      partner: "",
    });
  });

  it("never gives the imposter the word", () => {
    const role = roleFor(base, 1, "en");
    expect(role.isImposter).toBe(true);
    expect(role.word).toBe("");
    expect(role.category).toBe(entry.category.en);
  });

  it("gives the imposter a hint only when hints are on", () => {
    expect(roleFor(base, 1, "en").hint).toBe("");
    const hinted = { ...base, settings: { ...DEFAULT_SETTINGS, hintsEnabled: true } };
    expect(roleFor(hinted, 1, "en").hint).toBe(entry.hint.en);
    expect(roleFor(hinted, 0, "en").hint).toBe("");
  });
});
