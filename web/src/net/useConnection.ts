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

function connection(): Connection {
  if (singleton === null) {
    singleton = new Connection(wsUrl());
    singleton.start();
  }
  return singleton;
}

export function useConnection() {
  const c = connection();
  const snapshot = useSyncExternalStore(c.subscribe, c.getSnapshot, c.getSnapshot);
  return { snapshot, actions: c.actions, onGameEvent: c.onGameEvent };
}
