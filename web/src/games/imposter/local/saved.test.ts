import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, newGame } from "./localGame";
import { defaultSetup, parseGame, parseSetup } from "./saved";

describe("parseSetup", () => {
  const bad = [
    { name: "nothing saved", json: null },
    { name: "not JSON", json: "{oops" },
    { name: "no names", json: "{}" },
    { name: "too few names", json: '{"names":["a"]}' },
    { name: "names that are not strings", json: '{"names":[1,2,3]}' },
    { name: "JSON null", json: "null" },
  ];
  for (const tt of bad) {
    it(`${tt.name} gives the default setup`, () => {
      expect(parseSetup(tt.json)).toEqual(defaultSetup());
    });
  }

  it("keeps saved values and fills in settings it does not have", () => {
    const got = parseSetup('{"names":["a","b","c","d"],"settings":{"advance":"auto"}}');
    expect(got.names).toEqual(["a", "b", "c", "d"]);
    expect(got.settings).toEqual({ ...DEFAULT_SETTINGS, advance: "auto" });
  });
});

describe("parseGame", () => {
  const bad = [
    { name: "nothing saved", json: null },
    { name: "not JSON", json: "{oops" },
    { name: "the wrong shape", json: '{"names":"a"}' },
    { name: "JSON null", json: "null" },
  ];
  for (const tt of bad) {
    it(`${tt.name} gives no game`, () => {
      expect(parseGame(tt.json)).toBeNull();
    });
  }

  it("round-trips a real game", () => {
    const game = newGame(["a", "b", "c"], DEFAULT_SETTINGS, []);
    expect(parseGame(JSON.stringify(game))).toEqual(game);
  });
});
