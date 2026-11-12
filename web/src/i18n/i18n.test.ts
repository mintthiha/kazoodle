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

  // French counts 0 as singular, English does not: the locale's rules decide.
  const plurals = [
    { locale: "en", n: 0, want: "0 votes" },
    { locale: "en", n: 1, want: "1 vote" },
    { locale: "en", n: 2, want: "2 votes" },
    { locale: "fr", n: 0, want: "0 vote" },
    { locale: "fr", n: 1, want: "1 vote" },
    { locale: "fr", n: 2, want: "2 votes" },
  ] as const;
  it.each(plurals)("says $want in $locale", ({ locale, n, want }) => {
    expect(translate(locale, "fb.award.3", { n })).toBe(want);
  });

  it("picks a French plural for players fooled", () => {
    expect(translate("fr", "fb.award.2", { n: 1 })).toBe("1 piégé");
    expect(translate("fr", "fb.award.2", { n: 3 })).toBe("3 piégés");
  });

  it("leaves a plural visible when its count is missing", () => {
    expect(translate("en", "fb.award.3", {})).toBe("{n, plural, one {# vote} other {# votes}}");
  });
});
