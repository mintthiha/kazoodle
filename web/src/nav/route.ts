// Which screen the URL asks for. Pure functions only — no history API, no
// React — so the mapping is testable on its own. The hook that watches the
// browser lives in ./useRoute.

/** The hub, or one game's session flow (join -> lobby -> game). */
export type Route = { kind: "home" } | { kind: "game"; id: string };

/** parseRoute maps a pathname to a Route. Anything unrecognised — a typo, a
 * stale link, a game this build doesn't have — falls back to the hub rather
 * than erroring, because a party guest with a bad link should still see
 * something they can use. */
export function parseRoute(pathname: string, knownIds: readonly string[]): Route {
  const slug = pathname.replace(/^\/+|\/+$/g, "");
  if (slug !== "" && knownIds.includes(slug)) return { kind: "game", id: slug };
  return { kind: "home" };
}

/** routePath is the inverse of parseRoute: the URL to push for a Route. */
export function routePath(route: Route): string {
  return route.kind === "home" ? "/" : `/${route.id}`;
}
