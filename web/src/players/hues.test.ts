import { describe, expect, it } from "vitest";
import { assignHues, makeHueFor } from "./hues";

describe("assignHues", () => {
  const tests: { name: string; ids: string[]; wantDistinct: number }[] = [
    { name: "no players", ids: [], wantDistinct: 0 },
    { name: "one player", ids: ["a"], wantDistinct: 1 },
    { name: "a full table gets a hue each", ids: ["a", "b", "c", "d", "e", "f", "g", "h"], wantDistinct: 8 },
    { name: "ids that hash alike still differ", ids: ["Aa", "BB"], wantDistinct: 2 },
    { name: "a repeated id counts once", ids: ["a", "a", "b"], wantDistinct: 2 },
    { name: "past eight the hues repeat", ids: ["a", "b", "c", "d", "e", "f", "g", "h", "i"], wantDistinct: 8 },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      expect(new Set(assignHues(tt.ids).values()).size).toBe(tt.wantDistinct);
    });
  }

  it("gives every phone the same answer whatever order its roster is in", () => {
    const one = assignHues(["p1", "p2", "p3", "p4"]);
    const two = assignHues(["p3", "p1", "p4", "p2"]);
    expect([...two.entries()].sort()).toEqual([...one.entries()].sort());
  });
});

describe("makeHueFor", () => {
  it("colours a departed player the same way as one still here", () => {
    const hue = makeHueFor([{ id: "a" }], [{ id: "b" }]);
    expect(hue("b")).toBe(assignHues(["a", "b"]).get("b"));
  });

  it("still returns a hue for an id on neither list", () => {
    const hue = makeHueFor([{ id: "a" }], []);
    expect(typeof hue("stranger")).toBe("number");
  });
});
