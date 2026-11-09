import { describe, expect, it } from "vitest";
import { GAME_IDS, GAMES, LOCAL_GAME_IDS } from "./registry";

describe("registry", () => {
  it("gives every game at least one way to play", () => {
    for (const game of GAMES) {
      expect(game.online ?? game.localView, game.id).toBeDefined();
    }
  });

  it("routes a session to every game the server can run", () => {
    expect(GAME_IDS).toEqual(expect.arrayContaining(["imposter", "wavelength"]));
  });

  it("only routes a session to games with an online version", () => {
    for (const game of GAMES) {
      expect(GAME_IDS.includes(game.id), game.id).toBe(game.online !== undefined);
    }
  });

  it("routes one-phone play to every game that has it", () => {
    expect(LOCAL_GAME_IDS).toEqual(expect.arrayContaining(["imposter", "wavelength"]));
  });
});
