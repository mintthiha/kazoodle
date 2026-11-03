import { defineConfig } from "@playwright/test";
import { WEB_URL, webServers } from "./e2e/support/stack";

// The simulation: `npm run sim`. See sim/simulation.spec.ts. It is not part of
// `npm run test:e2e`, because it takes minutes and opens windows on your screen.
export default defineConfig({
  testDir: "sim",
  workers: 1,
  timeout: 15 * 60_000,
  reporter: [["list"]],
  // Windows are opened by sim/windows.ts, which needs more control than this offers.
  use: { baseURL: WEB_URL },
  webServer: webServers,
});
