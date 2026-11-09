import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_OPTIONS, decodeStartOptions, encodeStartOptions } from "./messages";
import { wavelengthRules } from "./rules";

describe("start options", () => {
  it.each([
    { answers: "typed", secret: "random" },
    { answers: "spoken", secret: "random" },
    { answers: "typed", secret: "chosen" },
    { answers: "spoken", secret: "chosen" },
  ] as const)("round-trip $answers / $secret", (opts) => {
    expect(decodeStartOptions(encodeStartOptions(opts))).toEqual(opts);
  });

  it("sends the server's own field names", () => {
    expect(JSON.parse(encodeStartOptions({ answers: "spoken", secret: "chosen" }))).toEqual({
      spokenAnswers: true,
      chosenSecret: true,
    });
  });

  it.each(["", "{not json", '{"spokenAnswers": "yes please"}'])("reads %j as the defaults", (json) => {
    expect(decodeStartOptions(json)).toEqual(DEFAULT_MATCH_OPTIONS);
  });

  it("picks the rules line that matches how the table answers", () => {
    expect(wavelengthRules(encodeStartOptions({ answers: "spoken", secret: "random" }))).toContain(
      "wl.rule.categorySpoken",
    );
    expect(wavelengthRules("")).toContain("wl.rule.category");
  });
});
