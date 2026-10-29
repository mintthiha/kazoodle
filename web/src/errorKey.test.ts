import { describe, expect, it } from "vitest";
import { errorKey } from "./errorKey";
import { translate } from "./i18n/messages";

describe("errorKey", () => {
  it("has a sentence for every code the server sends", () => {
    // These are the codes in server/internal/ws/conn.go.
    const codes = [
      "room_not_found",
      "not_host",
      "game_in_progress",
      "unknown_game",
      "start_failed",
      "already_in_room",
      "not_in_room",
    ];
    for (const code of codes) {
      const key = errorKey(code);
      if (!key) throw new Error(`${code} is unmapped`);
      expect(key).not.toBe("error.generic");
      for (const locale of ["en", "fr"] as const) {
        expect(translate(locale, key)).not.toBe(key);
      }
    }
  });

  it("falls back rather than showing a raw code", () => {
    // An error the player cannot be told about is how a button comes to look
    // broken — this app has shipped that bug once already.
    expect(errorKey("something_new_from_the_server")).toBe("error.generic");
  });

  it("is null when there is no error", () => {
    expect(errorKey(null)).toBeNull();
  });
});
