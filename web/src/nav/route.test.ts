import { describe, expect, it } from "vitest";
import { parseRoute, routePath, type Route } from "./route";

const known = ["imposter"];

describe("parseRoute", () => {
  const cases: { name: string; path: string; want: Route }[] = [
    { name: "root is the hub", path: "/", want: { kind: "home" } },
    { name: "empty path is the hub", path: "", want: { kind: "home" } },
    { name: "a known game slug", path: "/imposter", want: { kind: "game", id: "imposter" } },
    { name: "trailing slash", path: "/imposter/", want: { kind: "game", id: "imposter" } },
    { name: "unknown slug falls back", path: "/charades", want: { kind: "home" } },
    { name: "nested path falls back", path: "/imposter/room/ABCD", want: { kind: "home" } },
    { name: "a game's local version", path: "/imposter/local", want: { kind: "local", id: "imposter" } },
    { name: "local with a trailing slash", path: "/imposter/local/", want: { kind: "local", id: "imposter" } },
    { name: "local on a game without one", path: "/charades/local", want: { kind: "home" } },
    { name: "local as a game of its own", path: "/local", want: { kind: "home" } },
    { name: "anything else under a game", path: "/imposter/other", want: { kind: "home" } },
  ];
  for (const c of cases) {
    it(c.name, () => {
      expect(parseRoute(c.path, known, known)).toEqual(c.want);
    });
  }

  it("does not offer a local version the game does not have", () => {
    expect(parseRoute("/imposter/local", known)).toEqual({ kind: "home" });
  });
});

describe("routePath", () => {
  it("round-trips every kind", () => {
    const routes: Route[] = [
      { kind: "home" },
      { kind: "game", id: "imposter" },
      { kind: "local", id: "imposter" },
    ];
    for (const route of routes) {
      expect(parseRoute(routePath(route), known, known)).toEqual(route);
    }
  });
});
