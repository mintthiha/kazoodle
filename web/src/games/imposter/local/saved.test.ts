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
    expect(got.customCategories).toEqual([]);
  });

  const good = {
    key: "custom:1",
    name: "Ours",
    words: [
      { word: "a", hint: "x" },
      { word: "b", hint: "y" },
      { word: "c", hint: "z" },
    ],
  };
  const withCategories = (categories: unknown, category = "") =>
    JSON.stringify({ names: ["a", "b", "c"], settings: { category }, customCategories: categories });

  it("keeps custom categories and the selection of one", () => {
    const got = parseSetup(withCategories([good], "custom:1"));
    expect(got.customCategories).toEqual([good]);
    expect(got.settings.category).toBe("custom:1");
  });

  const badCategories = [
    { name: "null", value: null },
    { name: "a built-in key", value: { ...good, key: "food" } },
    { name: "no name", value: { key: "custom:2", words: good.words } },
    { name: "no words", value: { ...good, words: [] } },
    { name: "words that are plain strings", value: { ...good, words: ["a", "b", "c"] } },
    { name: "a word that is null", value: { ...good, words: [null] } },
    { name: "a word with no hint", value: { ...good, words: [{ word: "a" }] } },
    { name: "a word with an empty hint", value: { ...good, words: [{ word: "a", hint: "" }] } },
    { name: "a hint with an empty word", value: { ...good, words: [{ word: "", hint: "x" }] } },
  ];
  for (const tt of badCategories) {
    it(`drops only the bad category when it is ${tt.name}`, () => {
      expect(parseSetup(withCategories([good, tt.value])).customCategories).toEqual([good]);
    });
  }

  it("treats custom categories that are not a list as none", () => {
    expect(parseSetup(withCategories("oops")).customCategories).toEqual([]);
  });

  it("goes back to any category when the selected custom one is gone", () => {
    expect(parseSetup(withCategories([good], "custom:9")).settings.category).toBe("");
  });

  it("leaves a built-in selection alone", () => {
    expect(parseSetup(withCategories([], "food")).settings.category).toBe("food");
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
