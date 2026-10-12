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
  ];
  for (const c of cases) {
    it(c.name, () => {
      expect(parseRoute(c.path, known)).toEqual(c.want);
    });
  }
});

describe("routePath", () => {
  it("round-trips both kinds", () => {
    for (const route of [{ kind: "home" }, { kind: "game", id: "imposter" }] as Route[]) {
      expect(parseRoute(routePath(route), known)).toEqual(route);
    }
  });
});
