import { describe, expect, it } from "vitest";
import { buildLedger } from "./ledger";

describe("buildLedger", () => {
  const tests: {
    name: string;
    order: string[];
    clues: { playerId: string; text: string }[];
    want: { id: string; texts: string[] }[];
  }[] = [
    { name: "nobody at all", order: [], clues: [], want: [] },
    {
      name: "everyone gets a row before they speak",
      order: ["a", "b"],
      clues: [],
      want: [
        { id: "a", texts: [] },
        { id: "b", texts: [] },
      ],
    },
    {
      name: "clues group by person, in the order they were said",
      order: ["a", "b"],
      clues: [
        { playerId: "b", text: "one" },
        { playerId: "a", text: "two" },
        { playerId: "b", text: "three" },
      ],
      want: [
        { id: "a", texts: ["two"] },
        { id: "b", texts: ["one", "three"] },
      ],
    },
    {
      name: "a missed turn stays as an empty clue",
      order: ["a"],
      clues: [{ playerId: "a", text: "" }],
      want: [{ id: "a", texts: [""] }],
    },
    {
      name: "someone who left keeps their clues, after everyone else",
      order: ["a"],
      clues: [
        { playerId: "gone", text: "sandy" },
        { playerId: "a", text: "wet" },
      ],
      want: [
        { id: "a", texts: ["wet"] },
        { id: "gone", texts: ["sandy"] },
      ],
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      expect(buildLedger(tt.order, tt.clues)).toEqual(tt.want);
    });
  }
});
