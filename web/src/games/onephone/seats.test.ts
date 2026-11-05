import { describe, expect, it } from "vitest";
import { duplicateSeats, resizeNames, resolveNames } from "./seats";

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
  const bounds = { min: 3, max: 6 };
  const tests = [
    { name: "growing keeps names and adds blanks", from: ["a", "b", "c"], to: 4, want: ["a", "b", "c", ""] },
    { name: "shrinking drops from the end", from: ["a", "b", "c", "d"], to: 3, want: ["a", "b", "c"] },
    { name: "stops at the minimum", from: ["a", "b", "c"], to: 1, want: ["a", "b", "c"] },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(resizeNames(tt.from, tt.to, bounds)).toEqual(tt.want);
    });
  }

  it("stays inside the bounds it is given", () => {
    expect(resizeNames([], bounds.max + 5, bounds)).toHaveLength(bounds.max);
    expect(resizeNames([], 0, bounds)).toHaveLength(bounds.min);
  });
});
