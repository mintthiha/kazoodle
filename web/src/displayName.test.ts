import { describe, expect, it } from "vitest";
import { displayNameOf } from "./displayName";
import { translate } from "./i18n/messages";

describe("displayNameOf", () => {
  const t = (key: Parameters<typeof translate>[1]) => translate("en", key);

  it("shows the name a player actually has", () => {
    expect(displayNameOf("Ana", t)).toBe("Ana");
    expect(displayNameOf("Guest-7K3MP", t)).toBe("Guest-7K3MP");
  });

  it("never renders a blank row", () => {
    // The server names every guest, so this is the safety net for a room that
    // predates guest naming — a blank roster row reads as a broken app.
    expect(displayNameOf("", t)).toBe("Unnamed player");
    expect(displayNameOf("   ", t)).toBe("Unnamed player");
  });

  it("says it in the player's language", () => {
    expect(displayNameOf("", (key) => translate("fr", key))).toBe("Joueur sans nom");
  });
});
