import { describe, expect, it } from "vitest";
import { translate } from "./messages";

describe("translate", () => {
  it("returns the string for the active locale", () => {
    expect(translate("en", "join.createButton")).toBe("Create a room");
    expect(translate("fr", "join.createButton")).toBe("Créer un salon");
  });

  it("substitutes {name} placeholders", () => {
    expect(translate("en", "lobby.echoLast", { who: "Ana", text: "hi" })).toBe('Ana sent: “hi”');
  });

  it("leaves an unknown placeholder visible rather than printing undefined", () => {
    expect(translate("en", "lobby.echoLast", { who: "Ana" })).toBe('Ana sent: “{text}”');
  });
});
