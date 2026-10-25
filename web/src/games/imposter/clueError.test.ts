import { describe, expect, it } from "vitest";
import { clueErrorKey, localClueWarning } from "./clueError";
import { translate } from "../../i18n/messages";

describe("clueErrorKey", () => {
  it("maps each clue rejection the server can send", () => {
    // These strings are the contract with server/internal/games/imposter/clue.go.
    expect(clueErrorKey("imposter.clue_empty")).toBe("imposter.clueErrorEmpty");
    expect(clueErrorKey("imposter.clue_is_the_word")).toBe("imposter.clueErrorIsTheWord");
    expect(clueErrorKey("imposter.clue_duplicate")).toBe("imposter.clueErrorDuplicate");
  });

  it("falls back to a generic warning for a refusal with no stated reason", () => {
    expect(clueErrorKey("game_action_failed")).toBe("imposter.clueErrorGeneric");
  });

  it("ignores errors that are not about the clue", () => {
    expect(clueErrorKey("room_not_found")).toBeNull();
    expect(clueErrorKey("socket_error")).toBeNull();
    expect(clueErrorKey(null)).toBeNull();
  });

  it("has a real sentence in both locales for every code", () => {
    const codes = [
      "imposter.clue_empty",
      "imposter.clue_is_the_word",
      "imposter.clue_duplicate",
      "game_action_failed",
    ];
    for (const code of codes) {
      const key = clueErrorKey(code);
      if (!key) throw new Error(`${code} is unmapped`);
      for (const locale of ["en", "fr"] as const) {
        const text = translate(locale, key);
        // A missing entry falls through to the key itself, which would ship a
        // raw "imposter.clueErrorEmpty" to a player mid-round.
        expect(text).not.toBe(key);
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("localClueWarning", () => {
  it("warns about a clue that is not worth sending", () => {
    // Clicking Submit on an empty box used to do nothing at all, which read
    // as a broken button.
    expect(localClueWarning("")).toBe("imposter.clueErrorEmpty");
    expect(localClueWarning("   ")).toBe("imposter.clueErrorEmpty");
    expect(localClueWarning("\n\t")).toBe("imposter.clueErrorEmpty");
  });

  it("passes anything with content to the server, which owns the real rules", () => {
    expect(localClueWarning("sand")).toBeNull();
    expect(localClueWarning("  sand  ")).toBeNull();
    // Even the secret word: this side does not know what it is.
    expect(localClueWarning("Beach")).toBeNull();
  });
});
