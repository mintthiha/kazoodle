// React's view of the URL. Deliberately tiny: this app has one level of
// navigation (hub -> a game), so a router library would be more machinery than
// the problem needs. Swapping one in later means replacing this file.

import { useCallback, useEffect, useState } from "react";
import { parseRoute, type Route } from "./route";

interface Nav {
  route: Route;
  /** Push a new path and re-render. Same path is a no-op, so double-tapping a
   * game tile doesn't stack duplicate history entries. */
  navigate: (path: string) => void;
}

export function useRoute(knownIds: readonly string[]): Nav {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  // popstate fires on back/forward. Without this listener the URL would change
  // and the screen would not, which is the classic hand-rolled-router bug.
  useEffect(() => {
    function sync() {
      setPathname(window.location.pathname);
    }
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const navigate = useCallback((path: string) => {
    if (path === window.location.pathname) return;
    window.history.pushState(null, "", path);
    setPathname(path);
  }, []);

  return { route: parseRoute(pathname, knownIds), navigate };
}
