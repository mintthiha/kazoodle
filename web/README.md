# web

The browser client: React + Vite + TypeScript, mobile-first. Two screens so
far — join a room, then a lobby that shows who's connected and can round-trip a
test message. No games yet.

## Run

```bash
npm install
npm run dev            # http://localhost:5173
```

Needs the Go server running on `:8080` (see ../server). The client connects
straight to `ws://<host>:8080/ws` — there is no HTTP proxy. Override with
`VITE_WS_URL` if the server is elsewhere.

## Checks

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest run
npm run build          # tsc + vite build
```

## Browser tests

Playwright, driving a phone-sized Edge. Run on demand, not part of `npm test`.
Starts the dev server if one isn't running. No Go server is needed except for the
one test that proves the online door still opens a socket.

```bash
npm run test:e2e         # headless, about two minutes
npm run test:e2e:watch   # in a real window you can watch
npm run test:e2e:report  # the HTML report, with a video of every test
```

Setting `PW_SLOWMO=400` slows it down enough to follow (in PowerShell,
`$env:PW_SLOWMO=400; npm run test:e2e:watch`), and `PW_CHANNEL=chrome` uses Chrome
instead of Edge.

## Layout

```
src/
  net/                 the ONLY place that touches the socket
    gen/protocol_pb.ts   generated wire types (do not edit; see ../schema)
    messages.ts          encode/decode wire frames using the generated schema
    backoff.ts           exponential backoff with jitter (pure)
    connection.ts        one socket, reconnect, roster state, immutable snapshot
    useConnection.ts     React hook over a single app-wide Connection
  i18n/
    messages.ts          en + fr catalogues and the pure translate()
    index.tsx            <LocaleProvider> and useT()
  screens/
    JoinScreen.tsx        name + create / join by code
    LobbyScreen.tsx       room code, player list, echo box, leave
    ConnBanner.tsx        connecting / reconnecting / disconnected strip
  games/imposter/local/  Imposter on one phone: no server, no socket
    localGame.ts           the rules, as pure functions
    customCategories.ts    rules for categories a group writes itself
    words.gen.json         generated from the server's word list (see below)
  App.tsx                picks the screen from the URL
  main.tsx               entry
```

### Conventions (see ../CLAUDE.md)

- Components never open a socket or parse a frame — they use `useConnection()`.
- Wire types are always imported from `net/gen`, never hand-written.
- Every screen has a visible reconnecting state; a dropped connection is normal.
- Every user-facing string goes through `t()`; English and French ship together.

### The one-phone word list

`server/internal/games/imposter/words.go` is the only list anyone edits. After
changing it, regenerate the web copy from `server/`:

```bash
go test ./internal/games/imposter -run TestWebWordsMatch -update
```

`go test ./...` fails if the copy is out of date.

### Known gaps (intentional, pre-alpha)

- On reconnect the client re-sends its join, so the server issues a **new**
  player. True session restore (same identity) is an open design question.
- The single `Connection` is created once and never torn down on unmount — fine
  for a one-page app, revisit if routing is added.
