import { defineConfig, devices } from "@playwright/test";
import { WEB_URL, webServers } from "./e2e/support/stack";

// Browser tests, driven as a phone. These run on demand (`npm run test:e2e`) and
// are not part of `npm test`, which stays fast and needs no browser.
//
// Edge is the default because it is already on the dev machine, so nothing needs
// downloading; set PW_CHANNEL=chrome to use Chrome instead. PW_SLOWMO adds a pause
// in milliseconds before every action, so a human can follow along in `--headed`.
export default defineConfig({
  testDir: "e2e",
  // One at a time, so a headed run is watchable.
  workers: 1,
  timeout: 90_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Pixel 7"],
    baseURL: WEB_URL,
    channel: process.env.PW_CHANNEL ?? "msedge",
    locale: "en-US",
    // Every test leaves a video and a final screenshot, passing or not. They are
    // all linked from the HTML report.
    video: { mode: "on", size: { width: 412, height: 839 } },
    screenshot: "on",
    trace: "retain-on-failure",
    launchOptions: { slowMo: Number(process.env.PW_SLOWMO ?? 0) },
  },
  webServer: webServers,
});
