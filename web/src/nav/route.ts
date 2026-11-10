// Which screen the URL asks for. Pure functions only — no history API, no
// React — so the mapping is testable on its own. The hook that watches the
// browser lives in ./useRoute.

/** The hub, one game's session flow (join -> lobby -> game), the same game
 * hosted from a main screen (a TV the room watches), or the version of a game
 * that runs on one device with no session at all. */
export type Route =
  | { kind: "home" }
  | { kind: "game"; id: string }
  | { kind: "screen"; id: string }
  | { kind: "local"; id: string };

/** parseRoute maps a pathname to a Route. Anything unrecognised — a typo, a
 * stale link, a game this build doesn't have — falls back to the hub rather
 * than erroring, because a party guest with a bad link should still see
 * something they can use. */
export function parseRoute(
  pathname: string,
  knownIds: readonly string[],
  localIds: readonly string[] = [],
  screenIds: readonly string[] = [],
): Route {
  const parts = pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length === 1 && knownIds.includes(parts[0])) return { kind: "game", id: parts[0] };
  if (parts.length === 2 && parts[1] === "local" && localIds.includes(parts[0])) {
    return { kind: "local", id: parts[0] };
  }
  if (parts.length === 2 && parts[1] === "screen" && screenIds.includes(parts[0])) {
    return { kind: "screen", id: parts[0] };
  }
  return { kind: "home" };
}

/** routePath is the inverse of parseRoute: the URL to push for a Route. */
export function routePath(route: Route): string {
  switch (route.kind) {
    case "home":
      return "/";
    case "game":
      return `/${route.id}`;
    case "local":
      return `/${route.id}/local`;
    case "screen":
      return `/${route.id}/screen`;
  }
}
