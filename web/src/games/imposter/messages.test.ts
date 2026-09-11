import { describe, expect, it } from "vitest";
import { decodeImposterEvent, encodeMarkReady } from "./messages";

describe("imposter messages", () => {
  it("encodes markReady as a canonical-JSON envelope body", () => {
    expect(JSON.parse(encodeMarkReady())).toEqual({ markReady: {} });
  });

  it("decodes a roleAssignment event", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({ roleAssignment: { word: "Beach", category: "Places" } }),
    );
    expect(msg.body.case).toBe("roleAssignment");
    if (msg.body.case !== "roleAssignment") throw new Error("unreachable");
    expect(msg.body.value.isImposter).toBe(false);
    expect(msg.body.value.word).toBe("Beach");
  });

  it("decodes a roleAssignment event for the imposter (no word)", () => {
    const msg = decodeImposterEvent(JSON.stringify({ roleAssignment: { isImposter: true } }));
    if (msg.body.case !== "roleAssignment") throw new Error("unreachable");
    expect(msg.body.value.isImposter).toBe(true);
    expect(msg.body.value.word).toBe("");
  });

  it("decodes a revealProgress event", () => {
    const msg = decodeImposterEvent(
      JSON.stringify({ revealProgress: { readyPlayerIds: ["a", "b"], total: 3 } }),
    );
    if (msg.body.case !== "revealProgress") throw new Error("unreachable");
    expect(msg.body.value.readyPlayerIds).toEqual(["a", "b"]);
    expect(msg.body.value.total).toBe(3);
  });

  it("throws on a malformed payload", () => {
    expect(() => decodeImposterEvent("not json")).toThrow();
  });
});
