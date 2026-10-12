import { describe, expect, it } from "vitest";
import { translate } from "../../i18n/messages";
import { makeNameFor } from "./nameFor";

// The real catalogue rather than a stub, so a key renamed out from under this
// helper fails here instead of shipping a literal "{name} (left)".
const t = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
  translate("en", key, vars);

const players = [
  { id: "p1", displayName: "Ana" },
  { id: "p2", displayName: "Ben" },
];
const departed = [{ id: "p3", displayName: "Cal" }];

describe("makeNameFor", () => {
  it("names a player who is still in the room", () => {
    expect(makeNameFor(players, departed, t)("p2")).toBe("Ben");
  });

  it("names a player who has left, and says they left", () => {
    // Their clue stays in the recap after they're off the roster, so the name
    // still has to resolve — with the label, or the recap reads as if they
    // were still playing.
    expect(makeNameFor(players, departed, t)("p3")).toBe("Cal (left)");
  });

  it("never renders a raw player id", () => {
    // An id in neither list: a departure older than the connection remembers.
    const got = makeNameFor(players, departed, t)("p9");
    expect(got).toBe("a player who left");
    expect(got).not.toContain("p9");
  });

  it("prefers the roster when an id is somehow in both lists", () => {
    const both = makeNameFor(players, [{ id: "p1", displayName: "Ana" }], t);
    expect(both("p1")).toBe("Ana");
  });
});
