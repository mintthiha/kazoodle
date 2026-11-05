import { describe, expect, it } from "vitest";
import { GAME_IDS, GAMES, LOCAL_GAME_IDS } from "./registry";

describe("registry", () => {
  it("gives every game at least one way to play", () => {
    for (const game of GAMES) {
      expect(game.view ?? game.localView, game.id).toBeDefined();
    }
  });

  it("only routes a session to games the server can run", () => {
    expect(GAME_IDS).toContain("imposter");
    expect(GAME_IDS).not.toContain("wavelength");
  });

  it("routes one-phone play to every game that has it", () => {
    expect(LOCAL_GAME_IDS).toEqual(expect.arrayContaining(["imposter", "wavelength"]));
  });
});
