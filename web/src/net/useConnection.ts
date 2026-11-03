// The screens' entry point to the network. One Connection instance for the
// whole app; components read its snapshot reactively and call its actions.

import { useSyncExternalStore } from "react";
import { Connection } from "./connection";

function wsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  // Dev default: Vite on :5173, Go server on :8080, same host.
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.hostname}:8080/ws`;
}

let singleton: Connection | null = null;

/** sessionStorage, or nothing where the browser refuses it. Per tab on purpose: two
 * tabs are two players, which is how this gets tested and sometimes how it gets
 * played. It also survives a reload, which is the whole point. */
function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Tells the connection when the page comes and goes. Phones do this constantly, and
 * nothing else tells a socket that its page has been put away. The listeners live as
 * long as the page does, as the one connection they serve does. */
function watchPage(c: Connection): void {
  window.addEventListener("pagehide", () => c.suspend());
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) c.wake();
  });
  window.addEventListener("online", () => c.wake());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") c.wake();
  });
}

function connection(): Connection {
  if (singleton === null) {
    singleton = new Connection(wsUrl(), { store: sessionStore() });
    watchPage(singleton);
    singleton.start();
  }
  return singleton;
}

export function useConnection() {
  const c = connection();
  const snapshot = useSyncExternalStore(c.subscribe, c.getSnapshot, c.getSnapshot);
  return { snapshot, actions: c.actions, onGameEvent: c.onGameEvent };
}
