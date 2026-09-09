/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override the WebSocket URL of the session server. */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
