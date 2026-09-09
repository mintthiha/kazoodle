import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The dev server runs on 5173; the Go server runs on 8080 and is talked to
// directly over a WebSocket (see src/net/), so there is no HTTP proxy here.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    // Unit tests only: pure helpers plus the connection state machine driven by
    // a fake socket. No DOM, no real network.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
