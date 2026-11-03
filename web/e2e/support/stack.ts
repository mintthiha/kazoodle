// The servers a browser test runs against. These are started fresh for each run, on
// their own ports, and never reused. A dev server left running on the usual ports can
// be hours out of date, and a test passing or failing against old code tells nobody
// anything. It also means a test run cannot disturb a game someone is playing.

const GO_PORT = 8090;
const DEV_PORT = 5174;
const BUILD_PORT = 4174;

export const WEB_URL = `http://localhost:${DEV_PORT}`;
export const BUILD_URL = `http://localhost:${BUILD_PORT}`;

const WS_ENV = { VITE_WS_URL: `ws://localhost:${GO_PORT}/ws` };

export const webServers = [
  {
    command: "go run ./cmd/server",
    cwd: "../server",
    url: `http://localhost:${GO_PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PG_ADDR: `:${GO_PORT}`,
      PG_ALLOWED_ORIGINS: `localhost:${DEV_PORT},localhost:${BUILD_PORT}`,
    },
  },
  {
    command: `npm run dev -- --port ${DEV_PORT} --strictPort`,
    url: WEB_URL,
    reuseExistingServer: false,
    env: WS_ENV,
  },
  // A production build, because the offline support only exists in one.
  {
    command: `npm run build && npm run preview -- --port ${BUILD_PORT} --strictPort`,
    url: BUILD_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: WS_ENV,
  },
];
