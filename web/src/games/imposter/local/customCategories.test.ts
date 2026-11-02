import { describe, expect, it } from "vitest";
import {
  MAX_CUSTOM_HINT_LENGTH,
  MAX_CUSTOM_WORDS,
  MAX_CUSTOM_WORD_LENGTH,
  categoryProblem,
  customEntries,
  formatWords,
  isCustomKey,
  nextCustomKey,
  parseWords,
  type CustomWord,
} from "./customCategories";

const w = (word: string, hint = "h"): CustomWord => ({ word, hint });

describe("parseWords", () => {
  const tests = [
    { name: "nothing typed", text: "", want: [] },
    { name: "only blank lines and colons", text: " \n : \n\n", want: [] },
    { name: "one word and hint", text: "Cat: pet", want: [w("Cat", "pet")] },
    { name: "tidies the spaces", text: "  Cat  :   pet  ", want: [w("Cat", "pet")] },
    { name: "French spacing", text: "Chat : animal", want: [w("Chat", "animal")] },
    { name: "one per line", text: "Cat: pet\nDog: bark", want: [w("Cat", "pet"), w("Dog", "bark")] },
    { name: "Windows line endings", text: "Cat: pet\r\nDog: bark", want: [w("Cat", "pet"), w("Dog", "bark")] },
    { name: "blank lines between", text: "Cat: pet\n\nDog: bark\n", want: [w("Cat", "pet"), w("Dog", "bark")] },
    { name: "spaces inside a word stay", text: "ice cream: cold", want: [w("ice cream", "cold")] },
    { name: "commas stay in a hint", text: "Cat: soft, small", want: [w("Cat", "soft, small")] },
    { name: "only the first colon separates", text: "Clock: 12:00", want: [w("Clock", "12:00")] },
    { name: "no colon keeps the word, hintless", text: "Cat", want: [w("Cat", "")] },
    { name: "colon with nothing after", text: "Cat:", want: [w("Cat", "")] },
    { name: "hint with no word is kept to report", text: ": pet", want: [w("", "pet")] },
    {
      name: "repeats ignore case, first one wins",
      text: "Cat: a\ncat: b\nCAT: c",
      want: [w("Cat", "a")],
    },
  ];
  for (const tt of tests) {
    it(tt.name, () => expect(parseWords(tt.text)).toEqual(tt.want));
  }
});

describe("formatWords", () => {
  it("reads back to the same words, a colon in the hint included", () => {
    const words = [w("Cat", "pet"), w("Clock", "12:00"), w("ice cream", "cold, sweet")];
    expect(parseWords(formatWords(words))).toEqual(words);
  });
});

describe("categoryProblem", () => {
  const three = [w("a"), w("b"), w("c")];
  const many = (n: number) => Array.from({ length: n }, (_, i) => w(`w${i}`));
  const tests = [
    { name: "valid", catName: "Ours", words: three, want: null },
    { name: "blank name", catName: "   ", words: three, want: { kind: "nameMissing" } },
    { name: "name taken, ignoring case", catName: " FOOD ", words: three, want: { kind: "nameTaken" } },
    { name: "too few words", catName: "Ours", words: [w("a"), w("b")], want: { kind: "tooFew" } },
    { name: "no words", catName: "Ours", words: [], want: { kind: "tooFew" } },
    { name: "exactly the most words", catName: "Ours", words: many(MAX_CUSTOM_WORDS), want: null },
    {
      name: "one word over the most",
      catName: "Ours",
      words: many(MAX_CUSTOM_WORDS + 1),
      want: { kind: "tooMany" },
    },
    {
      name: "a word at the length limit",
      catName: "Ours",
      words: [w("a"), w("b"), w("x".repeat(MAX_CUSTOM_WORD_LENGTH))],
      want: null,
    },
    {
      name: "a word over the length limit",
      catName: "Ours",
      words: [w("a"), w("b"), w("x".repeat(MAX_CUSTOM_WORD_LENGTH + 1))],
      want: { kind: "wordTooLong", word: "x".repeat(MAX_CUSTOM_WORD_LENGTH + 1) },
    },
    {
      name: "emoji count as one character each",
      catName: "Ours",
      words: [w("a"), w("b"), w("😀".repeat(MAX_CUSTOM_WORD_LENGTH))],
      want: null,
    },
    {
      name: "every word must have a hint, naming the first without",
      catName: "Ours",
      words: [w("a"), w("b", ""), w("c", "")],
      want: { kind: "hintMissing", word: "b" },
    },
    {
      name: "a missing hint is reported ahead of too few words",
      catName: "Ours",
      words: [w("a", "")],
      want: { kind: "hintMissing", word: "a" },
    },
    {
      name: "a hint at the length limit",
      catName: "Ours",
      words: [w("a", "x".repeat(MAX_CUSTOM_HINT_LENGTH)), w("b"), w("c")],
      want: null,
    },
    {
      name: "a hint over the length limit",
      catName: "Ours",
      words: [w("a", "x".repeat(MAX_CUSTOM_HINT_LENGTH + 1)), w("b"), w("c")],
      want: { kind: "hintTooLong", word: "a" },
    },
    {
      name: "a hint with no word",
      catName: "Ours",
      words: [w("", "lost"), w("b"), w("c")],
      want: { kind: "wordMissing", hint: "lost" },
    },
  ];
  for (const tt of tests) {
    it(tt.name, () => expect(categoryProblem(tt.catName, tt.words, ["Food"])).toEqual(tt.want));
  }
});

describe("nextCustomKey", () => {
  it("starts at 1", () => expect(nextCustomKey([])).toBe("custom:1"));

  it("never reuses a key still in the list, even after a gap", () => {
    const existing = [
      { key: "custom:1", name: "a", words: [] },
      { key: "custom:5", name: "b", words: [] },
    ];
    expect(nextCustomKey(existing)).toBe("custom:6");
  });
});

describe("isCustomKey", () => {
  it("tells custom keys from built-in ones", () => {
    expect(isCustomKey("custom:1")).toBe(true);
    expect(isCustomKey("food")).toBe(false);
    expect(isCustomKey("")).toBe(false);
  });
});

describe("customEntries", () => {
  it("shows the word and hint as typed in both languages", () => {
    const [entry] = customEntries({ key: "custom:1", name: "Ours", words: [w("Cat", "pet")] });
    expect(entry).toEqual({
      categoryKey: "custom:1",
      category: { en: "Ours", fr: "Ours" },
      word: { en: "Cat", fr: "Cat" },
      hint: { en: "pet", fr: "pet" },
    });
  });
});
