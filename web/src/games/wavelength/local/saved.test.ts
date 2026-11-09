import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, MAX_PLAYERS, newGame } from "./localGame";
import { defaultSetup, parseGame, parseSetup } from "./saved";

describe("parseSetup", () => {
  const good = { names: ["Ana", "", "Cleo"], settings: { secret: "chosen", answers: "spoken" } };
  const tests = [
    { name: "nothing saved", json: null, want: defaultSetup() },
    { name: "not JSON", json: "{oops", want: defaultSetup() },
    { name: "JSON null", json: "null", want: defaultSetup() },
    { name: "a good setup", json: JSON.stringify(good), want: good },
    {
      name: "too few names keeps the settings",
      json: JSON.stringify({ ...good, names: ["Ana"] }),
      want: { names: defaultSetup().names, settings: good.settings },
    },
    {
      name: "too many names",
      json: JSON.stringify({ ...good, names: Array.from({ length: MAX_PLAYERS + 1 }, () => "") }),
      want: { names: defaultSetup().names, settings: good.settings },
    },
    {
      name: "unknown setting values",
      json: JSON.stringify({ ...good, settings: { secret: "psychic", answers: "mimed" } }),
      want: { names: good.names, settings: DEFAULT_SETTINGS },
    },
    {
      name: "a setup saved before answers could be spoken",
      json: JSON.stringify({ ...good, settings: { secret: "chosen" } }),
      want: { names: good.names, settings: { secret: "chosen", answers: "typed" } },
    },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(parseSetup(tt.json)).toEqual(tt.want);
    });
  }
});

describe("parseGame", () => {
  it("reads back a saved game", () => {
    const g = newGame(["a", "b", "c"], DEFAULT_SETTINGS, () => 0);
    expect(parseGame(JSON.stringify(g))).toEqual(g);
  });

  const bad = [
    { name: "nothing saved", json: null },
    { name: "not JSON", json: "nope" },
    { name: "JSON null", json: "null" },
    { name: "something else", json: JSON.stringify({ names: ["a"] }) },
  ];
  for (const tt of bad) {
    it(`refuses ${tt.name}`, () => {
      expect(parseGame(tt.json)).toBeNull();
    });
  }
});
